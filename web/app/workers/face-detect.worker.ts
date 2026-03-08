// Web Worker: Human.js の推論を別スレッドで実行
// 単一 Worker 方式: 全モデル (BlazeFace + FaceMesh + FaceRes) をロードし、
// detect-lite / detect-full メッセージで description.enabled を切り替え
// モデルファイルは IndexedDB にキャッシュして再起動時の高速ロードを実現

import Human from '@vladmandic/human'
import type { Config } from '@vladmandic/human'

const NORM_SIZE = 720
const IDB_NAME = 'human-model-cache'
const IDB_STORE = 'models'
const IDB_VERSION = 1

// --- IndexedDB キャッシュ ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<ArrayBuffer | undefined> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return undefined
  }
}

async function idbPut(key: string, value: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch {
    // キャッシュ書き込み失敗は無視
  }
}

// fetch をオーバーライドしてモデルファイルを IndexedDB キャッシュ
const originalFetch = self.fetch.bind(self)
const MODEL_URL_PATTERNS = [
  'vladmandic.github.io/human-models/',
  'cdn.jsdelivr.net/npm/@tensorflow/',
]

self.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const isModel = MODEL_URL_PATTERNS.some(p => url.includes(p))

  if (!isModel) return originalFetch(input, init)

  // IndexedDB からキャッシュ取得
  const cached = await idbGet(url)
  if (cached) {
    console.log(`[model-cache] HIT ${url.split('/').pop()}`)
    // Content-Type を推定
    const ct = url.endsWith('.json') ? 'application/json'
      : url.endsWith('.wasm') ? 'application/wasm'
      : 'application/octet-stream'
    return new Response(cached, { status: 200, headers: { 'Content-Type': ct } })
  }

  // ネットワークフェッチ → IndexedDB に保存
  const resp = await originalFetch(input, init)
  if (resp.ok) {
    const clone = resp.clone()
    clone.arrayBuffer().then(buf => {
      idbPut(url, buf)
      console.log(`[model-cache] STORE ${url.split('/').pop()} (${(buf.byteLength / 1024).toFixed(0)}KB)`)
    }).catch(() => {})
  }
  return resp
}

// --- Human.js 設定 ---

// 全モデル有効で初期化 (detect 時に description.enabled を切り替え)
const baseConfig: Partial<Config> = {
  backend: 'wasm',
  deallocate: true,
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

async function runDetect(bitmap: ImageBitmap, enableDescription: boolean) {
  if (!human) {
    return { face: [], gesture: [] }
  }

  const { canvas, ctx } = getNormCanvas()

  // センタークロップ: 短辺に合わせて長辺を中央で切り、正方形にリサイズ
  const vw = bitmap.width
  const vh = bitmap.height
  const cropSize = Math.min(vw, vh)
  const sx = (vw - cropSize) / 2
  const sy = (vh - cropSize) / 2
  ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, NORM_SIZE, NORM_SIZE)
  bitmap.close()

  // description (FaceRes) の有効/無効を切り替え
  human.config.face!.description!.enabled = enableDescription

  const result = await human.detect(canvas)

  // メインスレッドへ転送可能な形式にシリアライズ
  const face = result.face?.map(f => ({
    box: f.box,
    score: f.score,
    mesh: f.mesh,
    embedding: f.embedding ? Array.from(f.embedding) : null,
  })) ?? []

  return { face, gesture: result.gesture ?? [] }
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data

  if (type === 'init') {
    try {
      const t0 = performance.now()
      human = new Human(structuredClone(baseConfig))
      await human.load()
      await human.warmup()
      console.log(`[face-worker] ready in ${(performance.now() - t0).toFixed(0)}ms (all models)`)
      self.postMessage({ type: 'ready' })
    }
    catch (err) {
      self.postMessage({ type: 'error', message: String(err) })
    }
    return
  }

  // モデルファイルを IndexedDB にプリフェッチ (WASM にはロードしない)
  if (type === 'prefetch') {
    const urls: string[] = e.data.urls ?? []
    const t0 = performance.now()
    let fetched = 0
    await Promise.all(urls.map(async (url: string) => {
      const cached = await idbGet(url)
      if (cached) return // 既にキャッシュ済み
      try {
        const resp = await originalFetch(url)
        if (resp.ok) {
          const buf = await resp.arrayBuffer()
          await idbPut(url, buf)
          fetched++
          console.log(`[model-cache] PREFETCH ${url.split('/').pop()} (${(buf.byteLength / 1024).toFixed(0)}KB)`)
        }
      } catch {}
    }))
    console.log(`[model-cache] prefetch done: ${fetched} new files in ${(performance.now() - t0).toFixed(0)}ms`)
    self.postMessage({ type: 'prefetch_done', fetched })
    return
  }

  if (type === 'detect-lite') {
    const result = await runDetect(e.data.bitmap, false)
    self.postMessage({ type: 'result-lite', ...result })
    return
  }

  if (type === 'detect-full') {
    const result = await runDetect(e.data.bitmap, true)
    self.postMessage({ type: 'result-full', ...result })
    return
  }
}
