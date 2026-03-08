// Web Worker: Human.js の重い推論 (BlazeFace + FaceMesh + FaceRes) を別スレッドで実行
// メインスレッドは結果の mesh から瞬き判定するだけ (軽量)

import Human from '@vladmandic/human'
import type { Config } from '@vladmandic/human'

const NORM_SIZE = 720

// human-config.ts と同じ設定 (Worker からは ~/utils import 不可のためインライン)
const config: Partial<Config> = {
  backend: 'wasm',
  modelBasePath: 'https://vladmandic.github.io/human-models/models/',
  wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/',
  debug: false,
  cacheSensitivity: 0,
  filter: { enabled: true, flip: false },

  face: {
    enabled: true,
    detector: {
      enabled: true,
      modelPath: 'blazeface.json',
      rotation: false,
      maxDetected: 1,
      minConfidence: 0.5,
      iouThreshold: 0.1,
      return: false,
      skipFrames: 0,
    },
    mesh: {
      enabled: true,
      modelPath: 'facemesh.json',
      keepInvalid: false,
    },
    description: {
      enabled: true,
      modelPath: 'faceres.json',
      minConfidence: 0.1,
      skipFrames: 0,
    },
    iris: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },

  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: true },
  object: { enabled: false },
  segmentation: { enabled: false },
}

let human: Human | null = null
let normCanvas: OffscreenCanvas | null = null
let normCtx: OffscreenCanvasRenderingContext2D | null = null

function getNormCanvas() {
  if (!normCanvas) {
    normCanvas = new OffscreenCanvas(NORM_SIZE, NORM_SIZE)
    normCtx = normCanvas.getContext('2d')!
  }
  return { canvas: normCanvas, ctx: normCtx! }
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data

  if (type === 'init') {
    try {
      human = new Human(config)
      await human.load()
      await human.warmup()
      self.postMessage({ type: 'ready' })
    }
    catch (err) {
      self.postMessage({ type: 'error', message: String(err) })
    }
    return
  }

  if (type === 'detect') {
    if (!human) {
      self.postMessage({ type: 'result', face: [], gesture: [] })
      return
    }

    const bitmap: ImageBitmap = e.data.bitmap
    const needEmbedding: boolean = e.data.needEmbedding ?? true
    const { canvas, ctx } = getNormCanvas()

    // センタークロップ: 短辺に合わせて長辺を中央で切り、正方形にリサイズ
    const vw = bitmap.width
    const vh = bitmap.height
    const cropSize = Math.min(vw, vh)
    const sx = (vw - cropSize) / 2
    const sy = (vh - cropSize) / 2
    ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, NORM_SIZE, NORM_SIZE)
    bitmap.close()

    // needEmbedding=false → FaceRes スキップ (推論のみスキップ、モデルはメモリに常駐)
    const result = needEmbedding
      ? await human.detect(canvas)
      : await human.detect(canvas, { face: { description: { enabled: false } } })

    // メインスレッドへ転送可能な形式にシリアライズ
    const face = result.face?.map(f => ({
      box: f.box,
      score: f.score,
      mesh: f.mesh,
      embedding: f.embedding ? Array.from(f.embedding) : null,
    })) ?? []

    self.postMessage({ type: 'result', face, gesture: result.gesture ?? [] })
  }
}
