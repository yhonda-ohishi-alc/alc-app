import Human from '@vladmandic/human'
import { humanConfig } from '~/utils/human-config'

// 入力正規化: 映像フレームをセンタークロップして正方形キャンバスに描画
// ポートレート/ランドスケープ問わず顔が同じスケールになる
// モデルや正規化パラメータを変更した場合は FACE_MODEL_VERSION を更新すること（旧 embedding が自動フィルタされ再登録が促される）
export const NORM_SIZE = 720
export const FACE_MODEL_VERSION = 'faceres-wasm-square720-v4'

let humanInstance: Human | null = null
let normCanvas: HTMLCanvasElement | null = null
let normCtx: CanvasRenderingContext2D | null = null
const isReady = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

function getNormCanvas() {
  if (!normCanvas) {
    normCanvas = document.createElement('canvas')
    normCanvas.width = NORM_SIZE
    normCanvas.height = NORM_SIZE
    normCtx = normCanvas.getContext('2d')!
  }
  return { canvas: normCanvas, ctx: normCtx! }
}

export function useFaceDetection() {

  async function load() {
    if (humanInstance && isReady.value) return humanInstance
    if (isLoading.value) return null

    isLoading.value = true
    error.value = null

    try {
      humanInstance = new Human(humanConfig)
      await humanInstance.load()
      await humanInstance.warmup()
      isReady.value = true
      return humanInstance
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '顔検出モデルの読み込みに失敗しました'
      throw e
    }
    finally {
      isLoading.value = false
    }
  }

  async function detect(video: HTMLVideoElement) {
    if (!humanInstance) throw new Error('Human not loaded')
    const { canvas, ctx } = getNormCanvas()

    // センタークロップ: 短辺に合わせて長辺を中央で切り、正方形にリサイズ
    const vw = video.videoWidth
    const vh = video.videoHeight
    const cropSize = Math.min(vw, vh)
    const sx = (vw - cropSize) / 2
    const sy = (vh - cropSize) / 2

    ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, NORM_SIZE, NORM_SIZE)

    const result = await humanInstance.detect(canvas)
    return result
  }

  function getHuman() {
    return humanInstance
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
