import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock face-db module
const mockSaveFaceDescriptor = vi.fn()
const mockGetFaceDescriptor = vi.fn()
const mockGetAllDescriptors = vi.fn()
vi.mock('~/utils/face-db', () => ({
  saveFaceDescriptor: (...args: any[]) => mockSaveFaceDescriptor(...args),
  getFaceDescriptor: (...args: any[]) => mockGetFaceDescriptor(...args),
  getAllDescriptors: (...args: any[]) => mockGetAllDescriptors(...args),
}))

// Mock useFaceDetection (Nuxt auto-import)
const mockLoad = vi.fn()
const mockDetect = vi.fn()
vi.mock('~/composables/useFaceDetection', () => ({
  FACE_MODEL_VERSION: 'test-model-v1',
  useFaceDetection: () => ({
    load: mockLoad,
    detect: mockDetect,
  }),
}))

import { useFaceAuth } from '~/composables/useFaceAuth'

const VIDEO = {} as HTMLVideoElement

// Helper: create a normalized vector of given length
function makeEmbedding(length: number, seed = 1): number[] {
  const arr = Array.from({ length }, (_, i) => Math.sin(i * seed))
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0))
  return arr.map(v => v / norm)
}

describe('useFaceAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoad.mockResolvedValue(undefined)
  })

  describe('register', () => {
    it('should register with precomputed embedding', async () => {
      const emb = makeEmbedding(128)
      mockSaveFaceDescriptor.mockResolvedValue(undefined)
      mockGetFaceDescriptor.mockResolvedValue(emb)

      const { register } = useFaceAuth()
      const result = await register('emp-1', VIDEO, emb)

      expect(result).toBe(true)
      expect(mockLoad).not.toHaveBeenCalled()
      expect(mockDetect).not.toHaveBeenCalled()
      expect(mockSaveFaceDescriptor).toHaveBeenCalledWith('emp-1', emb, 'approved', 'test-model-v1')
      expect(mockGetFaceDescriptor).toHaveBeenCalledWith('emp-1', 'test-model-v1')
    })

    it('should register with detect when no precomputed embedding', async () => {
      const emb = makeEmbedding(128)
      mockDetect.mockResolvedValue({ face: [{ embedding: emb }] })
      mockSaveFaceDescriptor.mockResolvedValue(undefined)
      mockGetFaceDescriptor.mockResolvedValue(emb)

      const { register } = useFaceAuth()
      const result = await register('emp-2', VIDEO)

      expect(result).toBe(true)
      expect(mockLoad).toHaveBeenCalled()
      expect(mockDetect).toHaveBeenCalledWith(VIDEO)
    })

    it('should return false when detect returns no face', async () => {
      mockDetect.mockResolvedValue({ face: [] })

      const { register } = useFaceAuth()
      const result = await register('emp-3', VIDEO)

      expect(result).toBe(false)
    })

    it('should return false when embedding is null', async () => {
      mockDetect.mockResolvedValue({ face: [{ embedding: null }] })

      const { register } = useFaceAuth()
      const result = await register('emp-4', VIDEO)

      expect(result).toBe(false)
    })

    it('should return false when embedding is empty array', async () => {
      mockDetect.mockResolvedValue({ face: [{ embedding: [] }] })

      const { register } = useFaceAuth()
      const result = await register('emp-5', VIDEO)

      expect(result).toBe(false)
    })

    it('should return false when save verification fails (null)', async () => {
      const emb = makeEmbedding(128)
      mockSaveFaceDescriptor.mockResolvedValue(undefined)
      mockGetFaceDescriptor.mockResolvedValue(null)

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { register } = useFaceAuth()
      const result = await register('emp-6', VIDEO, emb)

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('[FaceAuth] register: save verification failed')
      consoleSpy.mockRestore()
    })

    it('should return false when save verification returns empty array', async () => {
      const emb = makeEmbedding(128)
      mockSaveFaceDescriptor.mockResolvedValue(undefined)
      mockGetFaceDescriptor.mockResolvedValue([])

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { register } = useFaceAuth()
      const result = await register('emp-7', VIDEO, emb)

      expect(result).toBe(false)
      consoleSpy.mockRestore()
    })
  })

  describe('verify', () => {
    it('should return not verified when no stored embedding', async () => {
      mockGetFaceDescriptor.mockResolvedValue(null)

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { verify } = useFaceAuth()
      const result = await verify('emp-1', VIDEO)

      expect(result).toEqual({ verified: false, similarity: 0 })
      expect(mockLoad).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should verify with precomputed embedding above threshold', async () => {
      const emb = makeEmbedding(128)
      mockGetFaceDescriptor.mockResolvedValue(emb)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { verify } = useFaceAuth()
      // same embedding => similarity = 1.0
      const result = await verify('emp-1', VIDEO, emb)

      expect(result.verified).toBe(true)
      expect(result.similarity).toBeCloseTo(1.0, 4)
      expect(mockDetect).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should verify with detect when no precomputed embedding', async () => {
      const stored = makeEmbedding(128, 1)
      const live = makeEmbedding(128, 1) // same => similarity ~1.0
      mockGetFaceDescriptor.mockResolvedValue(stored)
      mockDetect.mockResolvedValue({ face: [{ embedding: live }] })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { verify } = useFaceAuth()
      const result = await verify('emp-1', VIDEO)

      expect(result.verified).toBe(true)
      expect(mockDetect).toHaveBeenCalledWith(VIDEO)
      consoleSpy.mockRestore()
    })

    it('should return not verified when detect returns no face', async () => {
      const stored = makeEmbedding(128)
      mockGetFaceDescriptor.mockResolvedValue(stored)
      mockDetect.mockResolvedValue({ face: [] })

      const { verify } = useFaceAuth()
      const result = await verify('emp-1', VIDEO)

      expect(result).toEqual({ verified: false, similarity: 0 })
    })

    it('should return not verified when detect embedding is null', async () => {
      const stored = makeEmbedding(128)
      mockGetFaceDescriptor.mockResolvedValue(stored)
      mockDetect.mockResolvedValue({ face: [{ embedding: null }] })

      const { verify } = useFaceAuth()
      const result = await verify('emp-1', VIDEO)

      expect(result).toEqual({ verified: false, similarity: 0 })
    })

    it('should return not verified when detect embedding is empty', async () => {
      const stored = makeEmbedding(128)
      mockGetFaceDescriptor.mockResolvedValue(stored)
      mockDetect.mockResolvedValue({ face: [{ embedding: [] }] })

      const { verify } = useFaceAuth()
      const result = await verify('emp-1', VIDEO)

      expect(result).toEqual({ verified: false, similarity: 0 })
    })

    it('should return not verified when similarity is below threshold', async () => {
      // Orthogonal vectors => similarity = 0
      const stored = makeEmbedding(128, 1)
      const live = makeEmbedding(128, 100) // very different seed
      mockGetFaceDescriptor.mockResolvedValue(stored)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { verify } = useFaceAuth()
      const result = await verify('emp-1', VIDEO, live)

      expect(result.verified).toBe(false)
      expect(result.similarity).toBeLessThan(0.55)
      consoleSpy.mockRestore()
    })

    it('should handle non-Array embedding (Array.from path)', async () => {
      const stored = makeEmbedding(128, 1)
      mockGetFaceDescriptor.mockResolvedValue(stored)
      // Float32Array is not Array.isArray() => triggers Array.from branch
      const float32 = new Float32Array(stored)
      mockDetect.mockResolvedValue({ face: [{ embedding: float32 }] })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { verify } = useFaceAuth()
      const result = await verify('emp-1', VIDEO)

      expect(result.verified).toBe(true)
      expect(result.similarity).toBeCloseTo(1.0, 4)
      consoleSpy.mockRestore()
    })
  })

  describe('identify', () => {
    it('should return null when no descriptors', async () => {
      mockGetAllDescriptors.mockResolvedValue([])

      const { identify } = useFaceAuth()
      const result = await identify(VIDEO)

      expect(result).toBeNull()
      expect(mockLoad).toHaveBeenCalled()
    })

    it('should return null when detect returns no face', async () => {
      mockGetAllDescriptors.mockResolvedValue([
        { employeeId: 'emp-1', descriptor: makeEmbedding(128) },
      ])
      mockDetect.mockResolvedValue({ face: [] })

      const { identify } = useFaceAuth()
      const result = await identify(VIDEO)

      expect(result).toBeNull()
    })

    it('should return null when embedding is null', async () => {
      mockGetAllDescriptors.mockResolvedValue([
        { employeeId: 'emp-1', descriptor: makeEmbedding(128) },
      ])
      mockDetect.mockResolvedValue({ face: [{ embedding: null }] })

      const { identify } = useFaceAuth()
      const result = await identify(VIDEO)

      expect(result).toBeNull()
    })

    it('should return null when embedding is empty', async () => {
      mockGetAllDescriptors.mockResolvedValue([
        { employeeId: 'emp-1', descriptor: makeEmbedding(128) },
      ])
      mockDetect.mockResolvedValue({ face: [{ embedding: [] }] })

      const { identify } = useFaceAuth()
      const result = await identify(VIDEO)

      expect(result).toBeNull()
    })

    it('should return best match above threshold', async () => {
      const emb = makeEmbedding(128, 1)
      mockGetAllDescriptors.mockResolvedValue([
        { employeeId: 'emp-1', descriptor: makeEmbedding(128, 100) }, // different
        { employeeId: 'emp-2', descriptor: emb }, // same
      ])
      mockDetect.mockResolvedValue({ face: [{ embedding: emb }] })

      const { identify } = useFaceAuth()
      const result = await identify(VIDEO)

      expect(result).not.toBeNull()
      expect(result!.employeeId).toBe('emp-2')
      expect(result!.similarity).toBeCloseTo(1.0, 4)
    })

    it('should return null when all below threshold', async () => {
      // Create truly orthogonal embeddings: e1=[1,0,0,...], e2=[0,1,0,...], live=[0,0,1,0,...]
      const e1 = new Array(128).fill(0); e1[0] = 1
      const e2 = new Array(128).fill(0); e2[1] = 1
      const live = new Array(128).fill(0); live[2] = 1

      mockGetAllDescriptors.mockResolvedValue([
        { employeeId: 'emp-1', descriptor: e1 },
        { employeeId: 'emp-2', descriptor: e2 },
      ])
      mockDetect.mockResolvedValue({ face: [{ embedding: live }] })

      const { identify } = useFaceAuth()
      const result = await identify(VIDEO)

      expect(result).toBeNull()
    })

    it('should handle Float32Array embedding (Array.from path)', async () => {
      const emb = makeEmbedding(128, 1)
      mockGetAllDescriptors.mockResolvedValue([
        { employeeId: 'emp-1', descriptor: emb },
      ])
      // Return Float32Array to trigger Array.from branch
      mockDetect.mockResolvedValue({ face: [{ embedding: new Float32Array(emb) }] })

      const { identify } = useFaceAuth()
      const result = await identify(VIDEO)

      expect(result).not.toBeNull()
      expect(result!.employeeId).toBe('emp-1')
      expect(result!.similarity).toBeCloseTo(1.0, 4)
    })
  })

  describe('cosineSimilarity edge cases', () => {
    it('should return 0 for zero vectors (via verify)', async () => {
      const zero = new Array(128).fill(0)
      mockGetFaceDescriptor.mockResolvedValue(zero)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { verify } = useFaceAuth()
      const result = await verify('emp-1', VIDEO, zero)

      expect(result.verified).toBe(false)
      expect(result.similarity).toBe(0)
      consoleSpy.mockRestore()
    })
  })
})
