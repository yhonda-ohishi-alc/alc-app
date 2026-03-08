// 顔検出を Web Worker で実行
// 重い推論 (BlazeFace + FaceMesh + FaceRes) は別スレッド
// メインスレッドは結果の mesh から瞬き判定するだけ (軽量)

// モデルや正規化パラメータを変更した場合は FACE_MODEL_VERSION を更新すること（旧 embedding が自動フィルタされ再登録が促される）
export const NORM_SIZE = 720
export const FACE_MODEL_VERSION = 'faceres-wasm-square720-v4'

let worker: Worker | null = null
const isReady = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

// detect() の Promise 解決用
let pendingResolve: ((result: any) => void) | null = null
let pendingReject: ((err: Error) => void) | null = null

function handleWorkerMessage(e: MessageEvent) {
  const { type } = e.data
  if (type === 'result') {
    if (pendingResolve) {
      pendingResolve({ face: e.data.face, gesture: e.data.gesture })
      pendingResolve = null
      pendingReject = null
    }
  }
  else if (type === 'error') {
    if (pendingReject) {
      pendingReject(new Error(e.data.message))
      pendingResolve = null
      pendingReject = null
    }
  }
}

export function useFaceDetection() {

  async function load() {
    if (worker && isReady.value) return
    if (isLoading.value) return

    isLoading.value = true
    error.value = null

    try {
      worker = new Worker(
        new URL('../workers/face-detect.worker.ts', import.meta.url),
        { type: 'module' },
      )
      worker.onmessage = handleWorkerMessage

      await new Promise<void>((resolve, reject) => {
        const onInit = (e: MessageEvent) => {
          if (e.data.type === 'ready') {
            isReady.value = true
            // init 完了後は通常のハンドラに戻す
            worker!.onmessage = handleWorkerMessage
            resolve()
          }
          else if (e.data.type === 'error') {
            reject(new Error(e.data.message))
          }
        }
        worker!.onmessage = onInit
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

  async function detect(video: HTMLVideoElement): Promise<any> {
    if (!worker || !isReady.value) throw new Error('Worker not loaded')

    // video から ImageBitmap を作成 (メインスレッドでの唯一の重い処理)
    const bitmap = await createImageBitmap(video)

    return new Promise((resolve, reject) => {
      pendingResolve = resolve
      pendingReject = reject
      // ImageBitmap は Transferable — ゼロコピーで Worker に転送
      worker!.postMessage({ type: 'detect', bitmap }, [bitmap])
    })
  }

  function getHuman() {
    return null // Human インスタンスは Worker 内
  }

  return {
    isReady: readonly(isReady),
    isLoading: readonly(isLoading),
    error: readonly(error),
    load,
    detect,
    getHuman,
    NORM_SIZE,
    FACE_MODEL_VERSION,
  }
}
