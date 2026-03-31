import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  saveFaceDescriptor,
  getFaceDescriptor,
  getRawFaceDescriptor,
  getAllDescriptors,
  getAllDescriptorsWithTimestamp,
  bulkSaveFaceDescriptors,
  deleteFaceDescriptor,
} from '~/utils/face-db'

describe('face-db', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  describe('saveFaceDescriptor / getFaceDescriptor', () => {
    it('should save and retrieve a face descriptor', async () => {
      const descriptor = [0.1, 0.2, 0.3, 0.4, 0.5]
      await saveFaceDescriptor('EMP001', descriptor)

      const result = await getFaceDescriptor('EMP001')
      expect(result).toBeTruthy()
      expect(result).toHaveLength(5)
      expect(result![0]).toBeCloseTo(0.1)
      expect(result![4]).toBeCloseTo(0.5)
    })

    it('should return null for non-existent employee', async () => {
      const result = await getFaceDescriptor('NONEXISTENT')
      expect(result).toBeNull()
    })

    it('should update descriptor on re-save (same employeeId)', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2])
      await saveFaceDescriptor('EMP001', [0.9, 0.8])

      const result = await getFaceDescriptor('EMP001')
      expect(result![0]).toBeCloseTo(0.9)
      expect(result![1]).toBeCloseTo(0.8)
    })
  })

  describe('getAllDescriptors', () => {
    it('should return empty array when no data', async () => {
      const result = await getAllDescriptors()
      expect(result).toEqual([])
    })

    it('should return all saved descriptors', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2])
      await saveFaceDescriptor('EMP002', [0.3, 0.4])
      await saveFaceDescriptor('EMP003', [0.5, 0.6])

      const result = await getAllDescriptors()
      expect(result).toHaveLength(3)

      const ids = result.map(r => r.employeeId).sort()
      expect(ids).toEqual(['EMP001', 'EMP002', 'EMP003'])
    })

    it('should return plain number arrays (not Float32Array)', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2])
      const result = await getAllDescriptors()
      expect(Array.isArray(result[0].descriptor)).toBe(true)
    })
  })

  describe('deleteFaceDescriptor', () => {
    it('should delete a specific descriptor', async () => {
      await saveFaceDescriptor('EMP001', [0.1])
      await saveFaceDescriptor('EMP002', [0.2])

      await deleteFaceDescriptor('EMP001')

      expect(await getFaceDescriptor('EMP001')).toBeNull()
      expect(await getFaceDescriptor('EMP002')).toBeTruthy()
    })

    it('should not throw when deleting non-existent', async () => {
      await expect(deleteFaceDescriptor('NONEXISTENT')).resolves.not.toThrow()
    })
  })

  describe('getRawFaceDescriptor', () => {
    it('should return descriptor regardless of approvalStatus', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2, 0.3], 'pending')
      // getFaceDescriptor filters out non-approved
      const filtered = await getFaceDescriptor('EMP001')
      expect(filtered).toBeNull()
      // getRawFaceDescriptor ignores approvalStatus
      const raw = await getRawFaceDescriptor('EMP001')
      expect(raw).toBeTruthy()
      expect(raw).toHaveLength(3)
      expect(raw![0]).toBeCloseTo(0.1)
    })

    it('should return null for non-existent employee', async () => {
      const result = await getRawFaceDescriptor('NONEXISTENT')
      expect(result).toBeNull()
    })
  })

  describe('getAllDescriptorsWithTimestamp', () => {
    it('should return all records including timestamps and approvalStatus', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2], 'approved', 'v1')
      await saveFaceDescriptor('EMP002', [0.3, 0.4], 'pending', 'v2')

      const result = await getAllDescriptorsWithTimestamp()
      expect(result).toHaveLength(2)
      expect(result[0].employeeId).toBe('EMP001')
      expect(result[0].updatedAt).toBeTypeOf('number')
      expect(result[0].approvalStatus).toBe('approved')
      expect(result[0].modelVersion).toBe('v1')
      expect(result[1].approvalStatus).toBe('pending')
    })

    it('should return empty array when no data', async () => {
      const result = await getAllDescriptorsWithTimestamp()
      expect(result).toEqual([])
    })
  })

  describe('bulkSaveFaceDescriptors', () => {
    it('should save multiple records at once', async () => {
      await bulkSaveFaceDescriptors([
        { employeeId: 'EMP001', descriptor: [0.1, 0.2], updatedAt: 1000, modelVersion: 'v1' },
        { employeeId: 'EMP002', descriptor: [0.3, 0.4], updatedAt: 2000, modelVersion: 'v1' },
        { employeeId: 'EMP003', descriptor: [0.5, 0.6], updatedAt: 3000 },
      ])

      const all = await getAllDescriptors()
      expect(all).toHaveLength(3)
      const ids = all.map(r => r.employeeId).sort()
      expect(ids).toEqual(['EMP001', 'EMP002', 'EMP003'])
    })

    it('should do nothing when records array is empty', async () => {
      await bulkSaveFaceDescriptors([])
      const all = await getAllDescriptors()
      expect(all).toEqual([])
    })

    it('should set approvalStatus to approved for all records', async () => {
      await bulkSaveFaceDescriptors([
        { employeeId: 'EMP001', descriptor: [0.1], updatedAt: 1000 },
      ])
      const all = await getAllDescriptorsWithTimestamp()
      expect(all[0].approvalStatus).toBe('approved')
    })
  })

  describe('getFaceDescriptor filters', () => {
    it('should filter by approvalStatus (rejected)', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2], 'rejected')
      const result = await getFaceDescriptor('EMP001')
      expect(result).toBeNull()
    })

    it('should filter by modelVersion mismatch', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2], 'approved', 'v1')
      const result = await getFaceDescriptor('EMP001', 'v2')
      expect(result).toBeNull()
    })

    it('should return descriptor when modelVersion matches', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2], 'approved', 'v1')
      const result = await getFaceDescriptor('EMP001', 'v1')
      expect(result).toBeTruthy()
    })

    it('should return descriptor when no currentModelVersion is specified', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2], 'approved', 'v1')
      const result = await getFaceDescriptor('EMP001')
      expect(result).toBeTruthy()
    })

    it('should return descriptor when record has no modelVersion', async () => {
      await saveFaceDescriptor('EMP001', [0.1, 0.2], 'approved')
      const result = await getFaceDescriptor('EMP001', 'v2')
      expect(result).toBeTruthy()
    })
  })

  describe('getAllDescriptors filters', () => {
    it('should filter out non-approved records', async () => {
      await saveFaceDescriptor('EMP001', [0.1], 'approved')
      await saveFaceDescriptor('EMP002', [0.2], 'pending')
      await saveFaceDescriptor('EMP003', [0.3], 'rejected')

      const result = await getAllDescriptors()
      expect(result).toHaveLength(1)
      expect(result[0].employeeId).toBe('EMP001')
    })

    it('should filter by modelVersion when specified', async () => {
      await saveFaceDescriptor('EMP001', [0.1], 'approved', 'v1')
      await saveFaceDescriptor('EMP002', [0.2], 'approved', 'v2')

      const result = await getAllDescriptors('v1')
      expect(result).toHaveLength(1)
      expect(result[0].employeeId).toBe('EMP001')
    })

    it('should include records without modelVersion when filtering', async () => {
      await saveFaceDescriptor('EMP001', [0.1], 'approved')
      await saveFaceDescriptor('EMP002', [0.2], 'approved', 'v1')

      const result = await getAllDescriptors('v1')
      expect(result).toHaveLength(2)
    })
  })
})
