import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { MeasurementResult } from '~/types'

// Mock the API and offline-queue modules
vi.mock('~/utils/api', () => ({
  saveMeasurement: vi.fn(),
  updateMeasurement: vi.fn(),
}))

vi.mock('~/utils/offline-queue', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  flush: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
  pendingCount: vi.fn().mockResolvedValue(0),
  getAllWithStatus: vi.fn().mockResolvedValue([]),
  remove: vi.fn().mockResolvedValue(undefined),
  clearAll: vi.fn().mockResolvedValue(undefined),
  cleanupOld: vi.fn().mockResolvedValue(undefined),
}))

import { useOfflineSync } from '~/composables/useOfflineSync'
import { saveMeasurement, updateMeasurement } from '~/utils/api'
import { enqueue, flush } from '~/utils/offline-queue'

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

describe('useOfflineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })

  describe('save', () => {
    it('should call saveMeasurement directly when online', async () => {
      vi.mocked(saveMeasurement).mockResolvedValueOnce({
        id: '123',
        tenant_id: 'test',
        employee_id: 'EMP001',
        alcohol_value: 0.0,
        result_type: 'normal',
        device_use_count: 100,
        measured_at: '2026-01-15T08:00:00Z',
        created_at: '2026-01-15T08:00:01Z',
      })

      const { save } = useOfflineSync()
      const status = await save(createResult())

      expect(status).toBe('saved')
      expect(saveMeasurement).toHaveBeenCalledTimes(1)
      // save() now also enqueues locally on success (for local record)
      expect(enqueue).toHaveBeenCalledTimes(1)
    })

    it('should enqueue when API call fails', async () => {
      vi.mocked(saveMeasurement).mockRejectedValueOnce(new Error('network error'))

      const { save } = useOfflineSync()
      const status = await save(createResult())

      expect(status).toBe('queued')
      expect(enqueue).toHaveBeenCalledTimes(1)
    })
  })

  describe('syncQueue', () => {
    it('should flush pending items', async () => {
      vi.mocked(flush).mockResolvedValueOnce({ sent: 3, failed: 0 })

      const { syncQueue, lastSyncResult } = useOfflineSync()
      await syncQueue()

      expect(flush).toHaveBeenCalledWith(saveMeasurement, updateMeasurement)
      expect(lastSyncResult.value).toEqual({ sent: 3, failed: 0 })
    })

    it('should not sync when already syncing', async () => {
      let resolveFlush!: () => void
      vi.mocked(flush).mockReturnValue(
        new Promise(resolve => {
          resolveFlush = () => resolve({ sent: 1, failed: 0 })
        }),
      )

      const { syncQueue } = useOfflineSync()
      const p1 = syncQueue()
      await syncQueue()

      expect(flush).toHaveBeenCalledTimes(1)
      resolveFlush()
      await p1
    })

    it('should not sync when isSyncing is true (guard)', async () => {
      let resolveFlush2!: () => void
      vi.mocked(flush)
        .mockReturnValueOnce(
          new Promise(resolve => {
            resolveFlush2 = () => resolve({ sent: 2, failed: 0 })
          }),
        )

      const { syncQueue, isSyncing } = useOfflineSync()
      const p1 = syncQueue()
      expect(isSyncing.value).toBe(true)

      // Second sync should be blocked
      await syncQueue()
      expect(flush).toHaveBeenCalledTimes(1)

      resolveFlush2()
      await p1
      expect(isSyncing.value).toBe(false)
    })
  })
})
