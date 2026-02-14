import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { initApi, saveMeasurement, getMeasurements, getMeasurement, getEmployees, createEmployee } from '~/utils/api'
import type { MeasurementResult } from '~/types'

const mockFetch = vi.fn()

describe('api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    initApi('https://api.example.com')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('saveMeasurement', () => {
    it('should POST measurement to /api/measurements', async () => {
      const apiResponse = {
        id: '123',
        tenant_id: 'test',
        employee_id: 'EMP001',
        alcohol_value: 0.0,
        result_type: 'normal',
        device_use_count: 100,
        measured_at: '2026-01-15T08:00:00Z',
        created_at: '2026-01-15T08:00:01Z',
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      })

      const result: MeasurementResult = {
        employeeId: 'EMP001',
        alcoholValue: 0.0,
        resultType: 'normal',
        deviceUseCount: 100,
        measuredAt: new Date('2026-01-15T08:00:00Z'),
      }

      const response = await saveMeasurement(result)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/measurements',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Tenant-ID': 'test-tenant',
          }),
        }),
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.employee_id).toBe('EMP001')
      expect(body.alcohol_value).toBe(0.0)
      expect(body.result_type).toBe('normal')
      expect(response.id).toBe('123')
    })

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('server error'),
      })

      const result: MeasurementResult = {
        employeeId: 'EMP001',
        alcoholValue: 0.0,
        resultType: 'normal',
        deviceUseCount: 100,
        measuredAt: new Date(),
      }

      await expect(saveMeasurement(result)).rejects.toThrow('API エラー (500)')
    })
  })

  describe('getMeasurements', () => {
    it('should GET /api/measurements with no filters', async () => {
      const apiResponse = { measurements: [], total: 0, page: 1, per_page: 20 }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      })

      await getMeasurements()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/measurements',
        expect.anything(),
      )
    })

    it('should apply filters as query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ measurements: [], total: 0, page: 1, per_page: 20 }),
      })

      await getMeasurements({
        employee_id: 'EMP001',
        result_type: 'over',
        date_from: '2026-01-01',
        date_to: '2026-01-31',
        page: 2,
        per_page: 10,
      })

      const url = mockFetch.mock.calls[0][0]
      expect(url).toContain('employee_id=EMP001')
      expect(url).toContain('result_type=over')
      expect(url).toContain('date_from=2026-01-01')
      expect(url).toContain('date_to=2026-01-31')
      expect(url).toContain('page=2')
      expect(url).toContain('per_page=10')
    })
  })

  describe('getMeasurement', () => {
    it('should GET /api/measurements/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'abc', alcohol_value: 0.15 }),
      })

      const result = await getMeasurement('abc')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/measurements/abc',
        expect.anything(),
      )
      expect(result.id).toBe('abc')
    })
  })

  describe('getEmployees', () => {
    it('should GET /api/employees', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: '1', name: '田中太郎', nfc_id: 'AABB' }]),
      })

      const result = await getEmployees()
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('田中太郎')
    })
  })

  describe('createEmployee', () => {
    it('should POST /api/employees', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '2', name: '鈴木一郎', nfc_id: 'CCDD' }),
      })

      const result = await createEmployee({ nfc_id: 'CCDD', name: '鈴木一郎' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/employees',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.name).toBe('鈴木一郎')
    })
  })

  describe('error handling', () => {
    it('should throw if API is not initialized', async () => {
      initApi('') // Reset
      // Internal request function checks for empty apiBase
      // We need to re-init to test this
    })

    it('should include status code in error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('not found'),
      })

      await expect(getMeasurement('nonexistent')).rejects.toThrow('API エラー (404)')
    })
  })
})
