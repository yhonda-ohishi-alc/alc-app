import Human from '@vladmandic/human'
import { humanConfig } from '~/utils/human-config'

// 入力正規化: デバイス間の解像度差異を吸収するため、映像フレームを固定サイズに描画してから検出する
// モデルや正規化パラメータを変更した場合は FACE_MODEL_VERSION を更新すること（旧 embedding が自動フィルタされ再登録が促される）
export const NORM_W = 640
export const NORM_H = 480
export const FACE_MODEL_VERSION = 'faceres-norm640x480-v1'

let humanInstance: Human | null = null
let normCanvas: HTMLCanvasElement | null = null
let normCtx: CanvasRenderingContext2D | null = null
const isReady = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

function getNormCanvas() {
  if (!normCanvas) {
    normCanvas = document.createElement('canvas')
    normCanvas.width = NORM_W
    normCanvas.height = NORM_H
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

    // Clear to black (letterbox bars)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, NORM_W, NORM_H)

    // Letterbox fit preserving aspect ratio
    const vw = video.videoWidth
    const vh = video.videoHeight
    const scale = Math.min(NORM_W / vw, NORM_H / vh)
    const dw = vw * scale
    const dh = vh * scale
    const dx = (NORM_W - dw) / 2
    const dy = (NORM_H - dh) / 2

    ctx.drawImage(video, dx, dy, dw, dh)

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
    NORM_W,
    NORM_H,
    FACE_MODEL_VERSION,
  }
}
