import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  saveFaceDescriptor,
  getFaceDescriptor,
  getAllDescriptors,
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
})
