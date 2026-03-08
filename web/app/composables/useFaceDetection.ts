// 顔検出を単一 Web Worker で実行 (OOM 対策: WASM ランタイム重複を排除)
// 全モデル (BlazeFace + FaceMesh + FaceRes) を 1 Worker にロードし、
// detect-lite / detect-full メッセージで description.enabled を切り替え
// N フレームに 1 回 detect-full を挟んで embedding をバックグラウンド取得

export const NORM_SIZE = 720
export const FACE_MODEL_VERSION = 'faceres-wasm-square720-v4'

// --- Worker ---
let worker: Worker | null = null
const workerReady = ref(false)
let pendingResolve: ((result: any) => void) | null = null
let pendingReject: ((err: Error) => void) | null = null

// embedding をバックグラウンドで蓄積
const latestEmbedding = ref<number[] | null>(null)
let frameCounter = 0
const FULL_DETECT_INTERVAL = 4 // N フレームに 1 回 full detect

const isReady = computed(() => workerReady.value)
const isLoading = ref(false)
const error = ref<string | null>(null)

function createWorker() {
  return new Worker(
    new URL('../workers/face-detect.worker.ts', import.meta.url),
    { type: 'module' },
  )
}

function handleMessage(e: MessageEvent) {
  const { type } = e.data

  if (type === 'result-lite' || type === 'result-full') {
    // full の場合は embedding を蓄積
    if (type === 'result-full') {
      const emb = e.data.face?.[0]?.embedding
      if (emb && emb.length > 0) {
        latestEmbedding.value = emb
      }
    }

    if (pendingResolve) {
      pendingResolve({ face: e.data.face, gesture: e.data.gesture })
      pendingResolve = null
      pendingReject = null
    }
  }
  else if (type === 'error' && pendingReject) {
    pendingReject(new Error(e.data.message))
    pendingResolve = null
    pendingReject = null
  }
}

export function useFaceDetection() {

  async function load() {
    if (worker && workerReady.value) return
    if (isLoading.value) return

    isLoading.value = true
    error.value = null

    try {
      worker = createWorker()
      await new Promise<void>((resolve, reject) => {
        worker!.onmessage = (e: MessageEvent) => {
          if (e.data.type === 'ready') {
            workerReady.value = true
            worker!.onmessage = handleMessage
            resolve()
          }
          else if (e.data.type === 'error') reject(new Error(e.data.message))
        }
        worker!.postMessage({ type: 'init' })
      })
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '顔検出モデルの読み込みに失敗しました'
      throw e
    }
    finally {
      isLoading.value = false
    }
  }

  // 検出ループから呼ばれる
  // N フレームに 1 回 detect-full で embedding 取得 (未取得時のみ)
  async function detect(video: HTMLVideoElement): Promise<any> {
    if (!worker || !workerReady.value) throw new Error('Worker not loaded')

    const bitmap = await createImageBitmap(video)
    frameCounter++

    // embedding 未取得 かつ N フレームに 1 回 → detect-full
    const useFull = !latestEmbedding.value && (frameCounter % FULL_DETECT_INTERVAL === 0)
    const messageType = useFull ? 'detect-full' : 'detect-lite'

    return new Promise((resolve, reject) => {
      pendingResolve = resolve
      pendingReject = reject
      worker!.postMessage({ type: messageType, bitmap }, [bitmap])
    })
  }

  /** Worker を terminate してメモリ解放 */
  function terminateAll() {
    if (worker) {
      worker.terminate()
      worker = null
      workerReady.value = false
      pendingResolve = null
      pendingReject = null
    }
    latestEmbedding.value = null
    frameCounter = 0
    console.log('[FaceDetection] worker terminated, memory released')
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
    terminateAll,
    getHuman,
    NORM_SIZE,
    FACE_MODEL_VERSION,
  }
}
