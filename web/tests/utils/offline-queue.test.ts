import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { MeasurementResult } from '~/types'
import { enqueue, getAll, remove, pendingCount, flush } from '~/utils/offline-queue'

function createResult(overrides: Partial<MeasurementResult> = {}): MeasurementResult {
  return {
    employeeId: 'EMP001',
    alcoholValue: 0.0,
    resultType: 'normal',
    deviceUseCount: 100,
    measuredAt: new Date('2026-01-15T08:00:00Z'),
    ...overrides,
  }
}

describe('offline-queue', () => {
  beforeEach(() => {
    // Create a completely fresh IndexedDB instance for each test
    globalThis.indexedDB = new IDBFactory()
  })

  describe('enqueue', () => {
    it('should add a measurement to the queue', async () => {
      await enqueue(createResult())
      const items = await getAll()
      expect(items).toHaveLength(1)
      expect(items[0].result.employeeId).toBe('EMP001')
      expect(items[0].result.alcoholValue).toBe(0.0)
      expect(items[0].result.resultType).toBe('normal')
      expect(items[0].retryCount).toBe(0)
    })

    it('should serialize measuredAt as ISO string', async () => {
      await enqueue(createResult({ measuredAt: new Date('2026-02-14T10:00:00Z') }))
      const items = await getAll()
      expect(items[0].result.measuredAt).toBe('2026-02-14T10:00:00.000Z')
    })

    it('should store face photo as base64', async () => {
      const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' })
      await enqueue(createResult(), blob)
      const items = await getAll()
      expect(items[0].facePhotoBase64).toBeTruthy()
      expect(items[0].facePhotoBase64).toContain('data:')
    })

    it('should add multiple items with auto-increment IDs', async () => {
      await enqueue(createResult({ employeeId: 'A' }))
      await enqueue(createResult({ employeeId: 'B' }))
      await enqueue(createResult({ employeeId: 'C' }))
      const items = await getAll()
      expect(items).toHaveLength(3)
      const ids = items.map(i => i.id)
      expect(new Set(ids).size).toBe(3)
    })
  })

  describe('getAll', () => {
    it('should return empty array when no items', async () => {
      const items = await getAll()
      expect(items).toEqual([])
    })
  })

  describe('remove', () => {
    it('should remove a specific item by ID', async () => {
      await enqueue(createResult({ employeeId: 'A' }))
      await enqueue(createResult({ employeeId: 'B' }))
      const items = await getAll()
      await remove(items[0].id)
      const remaining = await getAll()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].result.employeeId).toBe('B')
    })
  })

  describe('pendingCount', () => {
    it('should return 0 when empty', async () => {
      expect(await pendingCount()).toBe(0)
    })

    it('should return correct count', async () => {
      await enqueue(createResult())
      await enqueue(createResult())
      expect(await pendingCount()).toBe(2)
    })
  })

  describe('flush', () => {
    it('should send all items via saveFn and remove them', async () => {
      await enqueue(createResult({ employeeId: 'A' }))
      await enqueue(createResult({ employeeId: 'B' }))

      const saveFn = vi.fn().mockResolvedValue(undefined)
      const result = await flush(saveFn)

      expect(saveFn).toHaveBeenCalledTimes(2)
      expect(result).toEqual({ sent: 2, failed: 0 })
      expect(await pendingCount()).toBe(0)
    })

    it('should increment retry count on failure', async () => {
      await enqueue(createResult())

      const saveFn = vi.fn().mockRejectedValue(new Error('network error'))
      const result = await flush(saveFn)

      expect(result).toEqual({ sent: 0, failed: 1 })
      const items = await getAll()
      expect(items[0].retryCount).toBe(1)
    })

    it('should skip items that exceeded max retries (5)', async () => {
      await enqueue(createResult())

      const saveFn = vi.fn().mockRejectedValue(new Error('fail'))
      // Exhaust retries
      for (let i = 0; i < 5; i++) {
        await flush(saveFn)
      }

      // 6th flush should skip the item
      saveFn.mockClear()
      const result = await flush(saveFn)
      expect(saveFn).not.toHaveBeenCalled()
      expect(result).toEqual({ sent: 0, failed: 1 })
    })

    it('should reconstruct MeasurementResult with Date object', async () => {
      await enqueue(createResult({ measuredAt: new Date('2026-01-15T08:00:00Z') }))

      const saveFn = vi.fn().mockResolvedValue(undefined)
      await flush(saveFn)

      const savedResult = saveFn.mock.calls[0][0]
      expect(savedResult.measuredAt).toBeInstanceOf(Date)
      expect(savedResult.measuredAt.toISOString()).toBe('2026-01-15T08:00:00.000Z')
    })
  })
})
