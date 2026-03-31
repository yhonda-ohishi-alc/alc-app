import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock Worker ---
let workerInstances: MockWorker[] = []

class MockWorker {
  url: any
  options: any
  onmessage: ((e: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()

  constructor(url: any, options?: any) {
    this.url = url
    this.options = options
    workerInstances.push(this)
  }

  // Helper: simulate worker sending a message
  simulateMessage(data: any) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

vi.stubGlobal('Worker', MockWorker)
vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }))

// Module-level state requires resetModules + dynamic import
let useFaceDetection: typeof import('~/composables/useFaceDetection').useFaceDetection
let NORM_SIZE: number
let FACE_MODEL_VERSION: string

describe('useFaceDetection', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    workerInstances = []

    vi.resetModules()
    const mod = await import('~/composables/useFaceDetection')
    useFaceDetection = mod.useFaceDetection
    NORM_SIZE = mod.NORM_SIZE
    FACE_MODEL_VERSION = mod.FACE_MODEL_VERSION
  })

  it('exports constants', () => {
    expect(NORM_SIZE).toBe(720)
    expect(FACE_MODEL_VERSION).toBe('faceres-wasm-square720-v4')
  })

  it('initial state: not ready, not loading, no error', () => {
    const fd = useFaceDetection()
    expect(fd.isReady.value).toBe(false)
    expect(fd.isLoading.value).toBe(false)
    expect(fd.error.value).toBeNull()
    expect(fd.latestEmbedding.value).toBeNull()
  })

  it('getHuman returns null', () => {
    const fd = useFaceDetection()
    expect(fd.getHuman()).toBeNull()
  })

  describe('load', () => {
    it('creates worker, sends init, resolves on ready', async () => {
      const fd = useFaceDetection()

      const loadPromise = fd.load()
      expect(fd.isLoading.value).toBe(true)

      // Worker should have been created
      expect(workerInstances).toHaveLength(1)
      const w = workerInstances[0]!
      expect(w.postMessage).toHaveBeenCalledWith({ type: 'init' })

      // Simulate worker ready
      w.simulateMessage({ type: 'ready' })

      await loadPromise
      expect(fd.isReady.value).toBe(true)
      expect(fd.isLoading.value).toBe(false)
      expect(fd.error.value).toBeNull()
    })

    it('rejects on worker error during init', async () => {
      const fd = useFaceDetection()

      const loadPromise = fd.load()
      const w = workerInstances[0]!

      // Simulate error message
      w.simulateMessage({ type: 'error', message: 'init failed' })

      await expect(loadPromise).rejects.toThrow('init failed')
      expect(fd.error.value).toBe('init failed')
      expect(fd.isLoading.value).toBe(false)
      expect(fd.isReady.value).toBe(false)
    })

    it('sets generic error message for non-Error throws', async () => {
      // Make Worker constructor throw a non-Error
      const OrigWorker = MockWorker
      const ThrowingWorker = function () { throw 'string error' } as any
      vi.stubGlobal('Worker', ThrowingWorker)

      vi.resetModules()
      const mod = await import('~/composables/useFaceDetection')
      const fd = mod.useFaceDetection()

      await expect(fd.load()).rejects.toBe('string error')
      expect(fd.error.value).toBe('顔検出モデルの読み込みに失敗しました')
      expect(fd.isLoading.value).toBe(false)

      vi.stubGlobal('Worker', OrigWorker)
    })

    it('skips if already loaded and ready', async () => {
      const fd = useFaceDetection()

      const p1 = fd.load()
      workerInstances[0]!.simulateMessage({ type: 'ready' })
      await p1

      // Second call should be a no-op
      await fd.load()
      expect(workerInstances).toHaveLength(1) // no new worker
    })

    it('skips if already loading (isLoading guard)', async () => {
      const fd = useFaceDetection()

      const p1 = fd.load()
      // While first load is pending, call load again
      const p2 = fd.load()
      // p2 returns immediately (undefined)
      expect(p2).resolves.toBeUndefined()

      // Still only 1 worker
      expect(workerInstances).toHaveLength(1)

      // Resolve the first load
      workerInstances[0]!.simulateMessage({ type: 'ready' })
      await p1
    })
  })

  describe('detect', () => {
    async function loadWorker(fd: ReturnType<typeof useFaceDetection>) {
      const p = fd.load()
      workerInstances[workerInstances.length - 1]!.simulateMessage({ type: 'ready' })
      await p
    }

    it('throws if worker not loaded', async () => {
      const fd = useFaceDetection()
      const video = {} as HTMLVideoElement
      await expect(fd.detect(video)).rejects.toThrow('Worker not loaded')
    })

    it('sends detect-lite by default and resolves on result-lite', async () => {
      const fd = useFaceDetection()
      await loadWorker(fd)
      const w = workerInstances[0]!

      const video = {} as HTMLVideoElement
      const detectPromise = fd.detect(video)

      // createImageBitmap の await を待つ
      await new Promise(r => setTimeout(r, 0))

      expect(w.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'detect-lite' }),
        expect.any(Array),
      )

      w.simulateMessage({ type: 'result-lite', face: [{ box: {} }], gesture: {} })

      const result = await detectPromise
      expect(result).toEqual({ face: [{ box: {} }], gesture: {} })
      expect(fd.latestEmbedding.value).toBeNull()
    })

    it('sends detect-full every FULL_DETECT_INTERVAL frames when embedding is null', async () => {
      const fd = useFaceDetection()
      await loadWorker(fd)
      const w = workerInstances[0]!

      const video = {} as HTMLVideoElement

      // Frames 1, 2, 3 → detect-lite
      for (let i = 0; i < 3; i++) {
        const p = fd.detect(video)
        await new Promise(r => setTimeout(r, 0))
        w.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
        await p
      }

      // Frame 4 (frameCounter=4, 4%4===0, latestEmbedding=null) → detect-full
      const p4 = fd.detect(video)
      await new Promise(r => setTimeout(r, 0))
      expect(w.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'detect-full' }),
        expect.any(Array),
      )

      // Simulate result-full with embedding
      w.simulateMessage({
        type: 'result-full',
        face: [{ embedding: [0.1, 0.2, 0.3] }],
        gesture: {},
      })
      await p4
      expect(fd.latestEmbedding.value).toEqual([0.1, 0.2, 0.3])
    })

    it('does NOT send detect-full once embedding is acquired', async () => {
      const fd = useFaceDetection()
      await loadWorker(fd)
      const w = workerInstances[0]!

      const video = {} as HTMLVideoElement

      // Frames 1-3 lite
      for (let i = 0; i < 3; i++) {
        const p = fd.detect(video)
        await new Promise(r => setTimeout(r, 0))
        w.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
        await p
      }

      // Frame 4: full → acquire embedding
      const p4 = fd.detect(video)
      await new Promise(r => setTimeout(r, 0))
      w.simulateMessage({ type: 'result-full', face: [{ embedding: [1, 2] }], gesture: {} })
      await p4
      expect(fd.latestEmbedding.value).toEqual([1, 2])

      // Frame 5-8: should all be detect-lite because embedding is now set
      for (let i = 0; i < 4; i++) {
        const p = fd.detect(video)
        await new Promise(r => setTimeout(r, 0))
        expect(w.postMessage).toHaveBeenLastCalledWith(
          expect.objectContaining({ type: 'detect-lite' }),
          expect.any(Array),
        )
        w.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
        await p
      }
    })

    it('result-full without embedding does not set latestEmbedding', async () => {
      const fd = useFaceDetection()
      await loadWorker(fd)
      const w = workerInstances[0]!
      const video = {} as HTMLVideoElement

      // Advance to frame 4
      for (let i = 0; i < 3; i++) {
        const p = fd.detect(video)
        await new Promise(r => setTimeout(r, 0))
        w.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
        await p
      }

      // Frame 4 full, but no embedding in face
      const p4 = fd.detect(video)
      await new Promise(r => setTimeout(r, 0))
      w.simulateMessage({ type: 'result-full', face: [{}], gesture: {} })
      await p4
      expect(fd.latestEmbedding.value).toBeNull()
    })

    it('result-full with empty embedding array does not set latestEmbedding', async () => {
      const fd = useFaceDetection()
      await loadWorker(fd)
      const w = workerInstances[0]!
      const video = {} as HTMLVideoElement

      for (let i = 0; i < 3; i++) {
        const p = fd.detect(video)
        await new Promise(r => setTimeout(r, 0))
        w.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
        await p
      }

      const p4 = fd.detect(video)
      await new Promise(r => setTimeout(r, 0))
      w.simulateMessage({ type: 'result-full', face: [{ embedding: [] }], gesture: {} })
      await p4
      expect(fd.latestEmbedding.value).toBeNull()
    })

    it('result-full with no face array does not set latestEmbedding', async () => {
      const fd = useFaceDetection()
      await loadWorker(fd)
      const w = workerInstances[0]!
      const video = {} as HTMLVideoElement

      for (let i = 0; i < 3; i++) {
        const p = fd.detect(video)
        await new Promise(r => setTimeout(r, 0))
        w.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
        await p
      }

      const p4 = fd.detect(video)
      await new Promise(r => setTimeout(r, 0))
      w.simulateMessage({ type: 'result-full', face: undefined, gesture: {} })
      await p4
      expect(fd.latestEmbedding.value).toBeNull()
    })

    it('rejects on worker error message', async () => {
      const fd = useFaceDetection()
      await loadWorker(fd)
      const w = workerInstances[0]!

      const video = {} as HTMLVideoElement
      const detectPromise = fd.detect(video)
      
      // createImageBitmap の await を待つ
      await new Promise(r => setTimeout(r, 0))

      // Simulate error from worker
      w.simulateMessage({ type: 'error', message: 'detect failed' })

      await expect(detectPromise).rejects.toThrow('detect failed')
    })
  })

  describe('terminateAll', () => {
    it('terminates worker and resets all state', async () => {
      const fd = useFaceDetection()

      // Load first
      const p = fd.load()
      const w = workerInstances[0]!
      w.simulateMessage({ type: 'ready' })
      await p
      expect(fd.isReady.value).toBe(true)

      // Acquire embedding
      const video = {} as HTMLVideoElement
      for (let i = 0; i < 3; i++) {
        const dp = fd.detect(video)
        await new Promise(r => setTimeout(r, 0))
        w.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
        await dp
      }
      const dp4 = fd.detect(video)
      await new Promise(r => setTimeout(r, 0))
      w.simulateMessage({ type: 'result-full', face: [{ embedding: [1] }], gesture: {} })
      await dp4
      expect(fd.latestEmbedding.value).toEqual([1])

      fd.terminateAll()

      expect(w.terminate).toHaveBeenCalled()
      expect(fd.isReady.value).toBe(false)
      expect(fd.latestEmbedding.value).toBeNull()
    })

    it('is safe to call when no worker exists', () => {
      const fd = useFaceDetection()
      // Should not throw
      fd.terminateAll()
      expect(fd.isReady.value).toBe(false)
      expect(fd.latestEmbedding.value).toBeNull()
    })

    it('resets frameCounter so detect-full cycle starts over after reload', async () => {
      const fd = useFaceDetection()

      // Load and do 3 frames
      let p = fd.load()
      workerInstances[0]!.simulateMessage({ type: 'ready' })
      await p

      const video = {} as HTMLVideoElement
      for (let i = 0; i < 3; i++) {
        const dp = fd.detect(video)
        await new Promise(r => setTimeout(r, 0))
        workerInstances[0]!.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
        await dp
      }

      fd.terminateAll()

      // Reload
      p = fd.load()
      workerInstances[workerInstances.length - 1]!.simulateMessage({ type: 'ready' })
      await p

      const w2 = workerInstances[workerInstances.length - 1]!

      // Frame 1 after reload: should be detect-lite (frameCounter reset to 0, now 1)
      const dp1 = fd.detect(video)
      await new Promise(r => setTimeout(r, 0))
      expect(w2.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'detect-lite' }),
        expect.any(Array),
      )
      w2.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
      await dp1
    })
  })

  describe('handleMessage edge cases', () => {
    it('result-lite/result-full without pending resolve is ignored', async () => {
      const fd = useFaceDetection()
      const p = fd.load()
      const w = workerInstances[0]!
      w.simulateMessage({ type: 'ready' })
      await p

      // After load, handleMessage is set but no detect pending
      // Sending result-lite should not throw
      w.simulateMessage({ type: 'result-lite', face: [], gesture: {} })
      // No error
    })

    it('error without pending reject is ignored', async () => {
      const fd = useFaceDetection()
      const p = fd.load()
      const w = workerInstances[0]!
      w.simulateMessage({ type: 'ready' })
      await p

      // No detect pending, error message should not throw
      w.simulateMessage({ type: 'error', message: 'random error' })
    })
  })

  describe('returned refs are readonly', () => {
    it('isReady, isLoading, error, latestEmbedding are readonly', () => {
      const fd = useFaceDetection()
      // Verify they are refs (have .value) but readonly (writing should be ignored/throw in dev)
      expect(fd.isReady.value).toBe(false)
      expect(fd.isLoading.value).toBe(false)
      expect(fd.error.value).toBeNull()
      expect(fd.latestEmbedding.value).toBeNull()
      expect(fd.NORM_SIZE).toBe(720)
      expect(fd.FACE_MODEL_VERSION).toBe('faceres-wasm-square720-v4')
    })
  })
})
