import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock api module
const mockGetFaceData = vi.fn()
const mockUpdateEmployeeFace = vi.fn()
vi.mock('~/utils/api', () => ({
  getFaceData: (...args: any[]) => mockGetFaceData(...args),
  updateEmployeeFace: (...args: any[]) => mockUpdateEmployeeFace(...args),
}))

// Mock face-db module
const mockGetAllDescriptorsWithTimestamp = vi.fn()
const mockBulkSaveFaceDescriptors = vi.fn()
vi.mock('~/utils/face-db', () => ({
  getAllDescriptorsWithTimestamp: (...args: any[]) => mockGetAllDescriptorsWithTimestamp(...args),
  bulkSaveFaceDescriptors: (...args: any[]) => mockBulkSaveFaceDescriptors(...args),
}))

// Mock useAuth (Nuxt auto-import)
;(globalThis as any).useAuth = () => ({
  deviceTenantId: ref('test-tenant'),
  accessToken: ref('test-token'),
})

// Disable onMounted auto-sync in tests
;(globalThis as any).onMounted = () => {}

// useFaceSync must be imported AFTER mocks are set up
// Use dynamic import to ensure mocks are in place
let useFaceSync: typeof import('~/composables/useFaceSync').useFaceSync

const UUID_1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const UUID_2 = '11111111-2222-3333-4444-555555555555'

describe('useFaceSync', () => {
  beforeEach(async () => {
    mockGetFaceData.mockReset()
    mockUpdateEmployeeFace.mockReset()
    mockGetAllDescriptorsWithTimestamp.mockReset()
    mockBulkSaveFaceDescriptors.mockReset()

    // Re-import to reset globalSyncing module state
    vi.resetModules()
    const mod = await import('~/composables/useFaceSync')
    useFaceSync = mod.useFaceSync
  })

  it('should download when server data is newer than local', async () => {
    mockGetFaceData.mockResolvedValue([
      { id: UUID_1, face_embedding: [0.1, 0.2], face_embedding_at: '2026-03-05T10:00:00Z' },
    ])
    mockGetAllDescriptorsWithTimestamp.mockResolvedValue([
      { employeeId: UUID_1, descriptor: new Float32Array([0.0, 0.0]), updatedAt: new Date('2026-03-04T10:00:00Z').getTime() },
    ])
    mockBulkSaveFaceDescriptors.mockResolvedValue(undefined)

    const { sync } = useFaceSync()
    await sync()

    expect(mockBulkSaveFaceDescriptors).toHaveBeenCalledWith([
      { employeeId: UUID_1, descriptor: [0.1, 0.2], updatedAt: new Date('2026-03-05T10:00:00Z').getTime() },
    ])
    // Should NOT upload since server already has data
    expect(mockUpdateEmployeeFace).not.toHaveBeenCalled()
  })

  it('should not upload when server already has approved data', async () => {
    mockGetFaceData.mockResolvedValue([
      { id: UUID_1, face_embedding: [0.1, 0.2], face_embedding_at: '2026-03-04T10:00:00Z' },
    ])
    // Local has same timestamp → no download, but serverMap.has(empId) → no upload either
    mockGetAllDescriptorsWithTimestamp.mockResolvedValue([
      { employeeId: UUID_1, descriptor: new Float32Array([0.1, 0.2]), updatedAt: new Date('2026-03-04T10:00:00Z').getTime() },
    ])

    const { sync } = useFaceSync()
    await sync()

    expect(mockBulkSaveFaceDescriptors).not.toHaveBeenCalled()
    expect(mockUpdateEmployeeFace).not.toHaveBeenCalled()
  })

  it('should upload when local data exists but server has none', async () => {
    mockGetFaceData.mockResolvedValue([])
    mockGetAllDescriptorsWithTimestamp.mockResolvedValue([
      { employeeId: UUID_1, descriptor: new Float32Array([0.5, 0.6]), updatedAt: Date.now() },
    ])
    mockUpdateEmployeeFace.mockResolvedValue(undefined)

    const { sync } = useFaceSync()
    await sync()

    expect(mockUpdateEmployeeFace).toHaveBeenCalledTimes(1)
    const [id, photo, desc] = mockUpdateEmployeeFace.mock.calls[0]
    expect(id).toBe(UUID_1)
    expect(photo).toBeUndefined()
    expect(desc[0]).toBeCloseTo(0.5)
    expect(desc[1]).toBeCloseTo(0.6)
  })

  it('should skip upload for non-UUID employee IDs', async () => {
    mockGetFaceData.mockResolvedValue([])
    mockGetAllDescriptorsWithTimestamp.mockResolvedValue([
      { employeeId: 'not-a-uuid', descriptor: new Float32Array([0.1]), updatedAt: Date.now() },
    ])

    const { sync } = useFaceSync()
    await sync()

    expect(mockUpdateEmployeeFace).not.toHaveBeenCalled()
  })

  it('should prevent concurrent sync calls via globalSyncing guard', async () => {
    // Make getFaceData slow so we can test concurrency
    let resolveFirst: () => void
    const firstCallPromise = new Promise<void>(r => { resolveFirst = r })
    mockGetFaceData
      .mockImplementationOnce(() => firstCallPromise.then(() => []))
      .mockResolvedValueOnce([])
    mockGetAllDescriptorsWithTimestamp.mockResolvedValue([])

    const { sync } = useFaceSync()

    // Start two syncs concurrently
    const p1 = sync()
    const p2 = sync() // Should be blocked by globalSyncing

    // Resolve the first call
    resolveFirst!()
    await Promise.all([p1, p2])

    // getFaceData should only be called once (second sync was blocked)
    expect(mockGetFaceData).toHaveBeenCalledTimes(1)
  })

  it('should handle sync errors gracefully', async () => {
    mockGetFaceData.mockRejectedValue(new Error('network error'))

    const { sync, syncError } = useFaceSync()
    await sync()

    expect(syncError.value).toBe('network error')
  })

  it('should download new entries and upload only entries not on server', async () => {
    // Server has UUID_1, local has UUID_1 (older) + UUID_2 (server doesn't have)
    mockGetFaceData.mockResolvedValue([
      { id: UUID_1, face_embedding: [0.9, 0.8], face_embedding_at: '2026-03-05T10:00:00Z' },
    ])
    mockGetAllDescriptorsWithTimestamp.mockResolvedValue([
      { employeeId: UUID_1, descriptor: new Float32Array([0.1, 0.2]), updatedAt: new Date('2026-03-01T00:00:00Z').getTime() },
      { employeeId: UUID_2, descriptor: new Float32Array([0.3, 0.4]), updatedAt: Date.now() },
    ])
    mockBulkSaveFaceDescriptors.mockResolvedValue(undefined)
    mockUpdateEmployeeFace.mockResolvedValue(undefined)

    const { sync } = useFaceSync()
    await sync()

    // UUID_1 should be downloaded (server is newer)
    expect(mockBulkSaveFaceDescriptors).toHaveBeenCalledWith([
      expect.objectContaining({ employeeId: UUID_1, descriptor: [0.9, 0.8] }),
    ])
    // UUID_2 should be uploaded (not on server)
    expect(mockUpdateEmployeeFace).toHaveBeenCalledTimes(1)
    const [id, photo, desc] = mockUpdateEmployeeFace.mock.calls[0]
    expect(id).toBe(UUID_2)
    expect(photo).toBeUndefined()
    expect(desc[0]).toBeCloseTo(0.3)
    expect(desc[1]).toBeCloseTo(0.4)
  })
})
