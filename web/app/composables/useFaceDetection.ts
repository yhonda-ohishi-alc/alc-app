// 顔検出を 2つの Web Worker で並列実行
// - liteWorker: BlazeFace + FaceMesh のみ (高速、瞬き検出用)
// - fullWorker: BlazeFace + FaceMesh + FaceRes (embedding 取得用、バックグラウンド)
// メインスレッドは結果を受け取って判定するだけ

export const NORM_SIZE = 720
export const FACE_MODEL_VERSION = 'faceres-wasm-square720-v4'

// --- lite Worker (瞬き検出用、高速) ---
let liteWorker: Worker | null = null
const liteReady = ref(false)
let litePendingResolve: ((result: any) => void) | null = null
let litePendingReject: ((err: Error) => void) | null = null

// --- full Worker (embedding 用、バックグラウンド) ---
let fullWorker: Worker | null = null
const fullReady = ref(false)

// 最新の embedding をバックグラウンドで蓄積
const latestEmbedding = ref<number[] | null>(null)
let fullBusy = false

const isReady = computed(() => liteReady.value)
const isLoading = ref(false)
const error = ref<string | null>(null)

function createWorker() {
  return new Worker(
    new URL('../workers/face-detect.worker.ts', import.meta.url),
    { type: 'module' },
  )
}

function handleLiteMessage(e: MessageEvent) {
  if (e.data.type === 'result' && litePendingResolve) {
    litePendingResolve({ face: e.data.face, gesture: e.data.gesture })
    litePendingResolve = null
    litePendingReject = null
  }
  else if (e.data.type === 'error' && litePendingReject) {
    litePendingReject(new Error(e.data.message))
    litePendingResolve = null
    litePendingReject = null
  }
}

function handleFullMessage(e: MessageEvent) {
  if (e.data.type === 'result') {
    fullBusy = false
    // embedding があれば蓄積
    const emb = e.data.face?.[0]?.embedding
    if (emb && emb.length > 0) {
      latestEmbedding.value = emb
    }
  }
}

export function useFaceDetection() {

  async function load() {
    if (liteWorker && liteReady.value) return
    if (isLoading.value) return

    isLoading.value = true
    error.value = null

    try {
      // lite Worker 起動
      liteWorker = createWorker()
      const litePromise = new Promise<void>((resolve, reject) => {
        liteWorker!.onmessage = (e: MessageEvent) => {
          if (e.data.type === 'ready') {
            liteReady.value = true
            liteWorker!.onmessage = handleLiteMessage
            resolve()
          }
          else if (e.data.type === 'error') reject(new Error(e.data.message))
        }
        liteWorker!.postMessage({ type: 'init', mode: 'lite' })
      })

      // full Worker 起動 (並列)
      fullWorker = createWorker()
      const fullPromise = new Promise<void>((resolve, reject) => {
        fullWorker!.onmessage = (e: MessageEvent) => {
          if (e.data.type === 'ready') {
            fullReady.value = true
            fullWorker!.onmessage = handleFullMessage
            resolve()
          }
          else if (e.data.type === 'error') reject(new Error(e.data.message))
        }
        fullWorker!.postMessage({ type: 'init', mode: 'full' })
      })

      // lite が ready になれば検出開始可能 (full は裏で初期化続行)
      await litePromise
      fullPromise.catch(err => console.warn('[FaceDetection] full worker init failed:', err))
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '顔検出モデルの読み込みに失敗しました'
      throw e
    }
    finally {
      isLoading.value = false
    }
  }

  // lite Worker で高速検出 (瞬き・顔位置チェック用)
  // 同時に full Worker にもフレームを送って embedding をバックグラウンド取得
  async function detect(video: HTMLVideoElement): Promise<any> {
    if (!liteWorker || !liteReady.value) throw new Error('Worker not loaded')

    const bitmap = await createImageBitmap(video)

    // full Worker が空いていれば embedding 取得をバックグラウンドで並列実行
    if (fullWorker && fullReady.value && !fullBusy) {
      const fullBitmap = await createImageBitmap(video)
      fullBusy = true
      fullWorker.postMessage({ type: 'detect', bitmap: fullBitmap }, [fullBitmap])
    }

    // lite Worker で高速検出 (メインのフレームループ)
    return new Promise((resolve, reject) => {
      litePendingResolve = resolve
      litePendingReject = reject
      liteWorker!.postMessage({ type: 'detect', bitmap }, [bitmap])
    })
  }

  function getHuman() {
    return null
  }

  return {
    isReady: readonly(isReady),
    isLoading: readonly(isLoading),
    error: readonly(error),
    latestEmbedding: readonly(latestEmbedding),
    load,
    detect,
    getHuman,
    NORM_SIZE,
    FACE_MODEL_VERSION,
  }
}
