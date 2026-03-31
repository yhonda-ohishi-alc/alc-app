import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  initApi,
  // Measurements
  saveMeasurement, startMeasurement, updateMeasurement, getMeasurements, getMeasurement,
  // Employees
  getEmployees, getEmployeeByNfcId, getEmployeeByCode, getEmployeeById,
  createEmployee, updateEmployee, deleteEmployee,
  updateEmployeeFace, approveFace, rejectFace, getFaceData,
  updateEmployeeNfcId, updateEmployeeLicense,
  // Face photo
  fetchFacePhoto, uploadFacePhoto, uploadReportAudio, uploadBlowVideo,
  // Tenko schedules
  createSchedule, batchCreateSchedules, listSchedules, getSchedule, updateSchedule, deleteSchedule, getPendingSchedules,
  // Tenko sessions
  startTenkoSession, getTenkoSession,
  submitAlcohol, submitMedical, submitSelfDeclaration, submitDailyInspection,
  confirmInstruction, submitReport,
  cancelTenkoSession, listTenkoSessions, getTenkoDashboard,
  interruptTenkoSession, resumeTenkoSession,
  // Tenko records
  listTenkoRecords, getTenkoRecord, downloadTenkoRecordsCsv,
  // Webhooks
  createWebhook, listWebhooks, getWebhook, deleteWebhook, getWebhookDeliveries,
  // Health baselines
  createBaseline, listBaselines, getBaseline, updateBaseline, deleteBaseline,
  // Equipment failures
  createFailure, listFailures, getFailure, resolveFailure, downloadFailuresCsv,
  // Timecard
  createTimecardCard, listTimecardCards, deleteTimecardCard, getTimecardCardByCardId, punchTimecard,
  listTimePunches, downloadTimePunchesCsv,
  // Devices
  createDeviceRegistrationRequest, checkDeviceRegistrationStatus, claimDeviceRegistration,
  listDevices, listPendingDeviceRegistrations,
  createDeviceUrlToken, createPermanentQr, createDeviceOwnerToken,
  approveDevice, approveDeviceByCode, rejectDevice, disableDevice, enableDevice, deleteDevice,
  getDeviceSettings, updateDeviceCallSettings, updateDeviceLastLogin,
  testFcmNotification, testFcmAll, triggerUpdate,
  // Carrying items
  getCarryingItems, createCarryingItem, updateCarryingItem, deleteCarryingItem, submitCarryingItemChecks,
  // Driver info
  getDriverInfo,
  // Dtako
  getDtakoDrivers, getDtakoDailyHours,
  // Vehicle categories
  getVehicleCategories,
  // Daily health
  getDailyHealthStatus,
  // Guidance records
  listGuidanceRecords, createGuidanceRecord, deleteGuidanceRecord, uploadGuidanceAttachment, deleteGuidanceAttachment,
  // Communication items
  listCommunicationItems, getActiveCommunicationItems, createCommunicationItem, updateCommunicationItem, deleteCommunicationItem,
} from '~/utils/api'
import type { MeasurementResult } from '~/types'

const mockFetch = vi.fn()

// Helper: standard OK response for request()-based calls
function okJson(data: unknown = {}) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) }
}

// Helper: 204 No Content response (for DELETE / void)
function ok204() {
  return { ok: true, status: 204 }
}

// Helper: error response
function errResponse(status: number, body = '') {
  return { ok: false, status, statusText: 'Error', text: () => Promise.resolve(body) }
}

describe('api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    // キオスクモード: tenant getter でテナントIDを返す
    initApi('https://api.example.com', undefined, () => 'test-tenant')
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ============================================================
  // initApi / request() internals
  // ============================================================

  describe('initApi and request internals', () => {
    it('should throw if API is not initialized (empty baseUrl)', async () => {
      initApi('')
      await expect(getEmployees()).rejects.toThrow('API 未初期化')
    })

    it('should strip trailing slash from baseUrl', async () => {
      initApi('https://api.example.com/', undefined, () => 'test-tenant')
      mockFetch.mockResolvedValueOnce(okJson([]))
      await getEmployees()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/employees')
    })

    it('should return undefined for 204 No Content', async () => {
      mockFetch.mockResolvedValueOnce(ok204())
      const result = await deleteSchedule('s1')
      expect(result).toBeUndefined()
    })

    it('should include status code in error message', async () => {
      mockFetch.mockResolvedValueOnce(errResponse(404, 'not found'))
      await expect(getMeasurement('nonexistent')).rejects.toThrow('API エラー (404)')
    })

    it('should use statusText when body is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve(''),
      })
      await expect(getEmployees()).rejects.toThrow('Internal Server Error')
    })

    it('should handle text() rejection gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: () => Promise.reject(new Error('stream error')),
      })
      await expect(getEmployees()).rejects.toThrow('API エラー (502)')
    })
  })

  // ============================================================
  // Authentication headers
  // ============================================================

  describe('authentication headers', () => {
    it('should send Authorization header when JWT is available', async () => {
      initApi('https://api.example.com', () => 'jwt-token-123', () => 'test-tenant')
      mockFetch.mockResolvedValueOnce(okJson([]))

      await getEmployees()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/employees',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer jwt-token-123',
          }),
        }),
      )
      // JWT 優先のため X-Tenant-ID は送信されない
      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['X-Tenant-ID']).toBeUndefined()
    })

    it('should fall back to X-Tenant-ID when no JWT is available', async () => {
      initApi('https://api.example.com', () => null, () => 'kiosk-tenant-id')
      mockFetch.mockResolvedValueOnce(okJson([]))

      await getEmployees()

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['X-Tenant-ID']).toBe('kiosk-tenant-id')
      expect(headers['Authorization']).toBeUndefined()
    })

    it('should send no auth headers when both getters return null', async () => {
      initApi('https://api.example.com', () => null, () => null)
      mockFetch.mockResolvedValueOnce(okJson([]))

      await getEmployees()

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['X-Tenant-ID']).toBeUndefined()
      expect(headers['Authorization']).toBeUndefined()
    })

    it('should send no auth headers when getters are not provided', async () => {
      initApi('https://api.example.com')
      mockFetch.mockResolvedValueOnce(okJson([]))

      await getEmployees()

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['X-Tenant-ID']).toBeUndefined()
      expect(headers['Authorization']).toBeUndefined()
    })

    it('should fall back to X-Tenant-ID when JWT getter not provided but tenant getter returns value', async () => {
      initApi('https://api.example.com', undefined, () => 'tenant-only')
      mockFetch.mockResolvedValueOnce(okJson([]))

      await getEmployees()

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['X-Tenant-ID']).toBe('tenant-only')
    })
  })

  // ============================================================
  // 401 Token refresh
  // ============================================================

  describe('401 token refresh', () => {
    it('should refresh token and retry on 401', async () => {
      let token = 'old-token'
      const refresher = vi.fn(async () => { token = 'new-token' })
      initApi('https://api.example.com', () => token, undefined, refresher)

      // First call returns 401, retry returns 200
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', text: () => Promise.resolve('') })
        .mockResolvedValueOnce(okJson({ id: '1' }))

      const result = await getEmployees()
      expect(refresher).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result).toEqual({ id: '1' })
    })

    it('should fall through to original 401 error when retry also fails', async () => {
      const refresher = vi.fn(async () => {})
      initApi('https://api.example.com', () => 'token', undefined, refresher)

      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', text: () => Promise.resolve('unauthorized') })
        .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden', text: () => Promise.resolve('denied') })

      // The retry error is caught by the outer catch, falling through to the original 401 error
      await expect(getEmployees()).rejects.toThrow('API エラー (401)')
      expect(refresher).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should fall through to original error when refresher rejects', async () => {
      const refresher = vi.fn(async () => { throw new Error('refresh failed') })
      initApi('https://api.example.com', () => 'token', undefined, refresher)

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('unauthorized'),
      })

      await expect(getEmployees()).rejects.toThrow('API エラー (401)')
    })

    it('should not attempt refresh when no tokenRefresher is set', async () => {
      initApi('https://api.example.com', () => 'token')
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(''),
      })

      await expect(getEmployees()).rejects.toThrow('API エラー (401)')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should not attempt refresh when getAccessToken returns null', async () => {
      const refresher = vi.fn(async () => {})
      initApi('https://api.example.com', () => null, () => 'tenant', refresher)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(''),
      })

      await expect(getEmployees()).rejects.toThrow('API エラー (401)')
      expect(refresher).not.toHaveBeenCalled()
    })

    it('should handle 204 on retry after refresh', async () => {
      const refresher = vi.fn(async () => {})
      initApi('https://api.example.com', () => 'token', undefined, refresher)

      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', text: () => Promise.resolve('') })
        .mockResolvedValueOnce({ ok: true, status: 204 })

      const result = await deleteSchedule('s1')
      expect(result).toBeUndefined()
    })

    it('should share refresh promise for concurrent 401s', async () => {
      let callCount = 0
      const refresher = vi.fn(async () => { callCount++ })
      initApi('https://api.example.com', () => 'token', undefined, refresher)

      // All calls get 401 (both original and retry)
      mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', text: () => Promise.resolve('') })

      // Fire two concurrent requests that both get 401
      const p1 = getEmployees().catch(() => {})
      const p2 = getEmployees().catch(() => {})

      await Promise.all([p1, p2])

      // refresher should only be called once (the second request reuses the same promise)
      expect(refresher).toHaveBeenCalledTimes(1)
    })

    it('should handle retry text() error and fall through to original 401', async () => {
      const refresher = vi.fn(async () => {})
      initApi('https://api.example.com', () => 'token', undefined, refresher)

      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', text: () => Promise.resolve('original') })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error', text: () => Promise.reject(new Error('fail')) })

      // Retry throws (text() rejects), caught by outer catch, falls through to original 401 error
      await expect(getEmployees()).rejects.toThrow('API エラー (401)')
    })
  })

  // ============================================================
  // toParams
  // ============================================================

  describe('toParams (via filter-based functions)', () => {
    it('should exclude null and empty string values', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ schedules: [], total: 0 }))
      await listSchedules({ employee_id: '', status: undefined as any })
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toBe('https://api.example.com/api/tenko/schedules')
    })

    it('should include non-empty values', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ schedules: [], total: 0 }))
      await listSchedules({ employee_id: 'e1', status: 'pending' } as any)
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('employee_id=e1')
      expect(url).toContain('status=pending')
    })
  })

  // ============================================================
  // saveMeasurement
  // ============================================================

  describe('saveMeasurement', () => {
    const baseResult: MeasurementResult = {
      employeeId: 'EMP001',
      alcoholValue: 0.0,
      resultType: 'normal',
      deviceUseCount: 100,
      measuredAt: new Date('2026-01-15T08:00:00Z'),
    }

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
      mockFetch.mockResolvedValueOnce(okJson(apiResponse))

      const response = await saveMeasurement(baseResult)

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

      await expect(saveMeasurement(baseResult)).rejects.toThrow('API エラー (500)')
    })

    it('should upload face photo and include URL when facePhotoBlob is provided', async () => {
      // First call: uploadFacePhoto (direct fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://r2.example.com/face.jpg' }),
      })
      // Second call: saveMeasurement via request()
      mockFetch.mockResolvedValueOnce(okJson({ id: '123' }))

      const blob = new Blob(['photo'], { type: 'image/jpeg' })
      await saveMeasurement(baseResult, blob)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      // Verify the measurement body has the uploaded face_photo_url
      const body = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(body.face_photo_url).toBe('https://r2.example.com/face.jpg')
    })

    it('should include optional medical fields in body', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ id: '456' }))

      const resultWithMedical: MeasurementResult = {
        ...baseResult,
        temperature: 36.5,
        systolic: 120,
        diastolic: 80,
        pulse: 72,
        medicalMeasuredAt: new Date('2026-01-15T07:55:00Z'),
        facePhotoUrl: 'https://existing.com/photo.jpg',
      }
      await saveMeasurement(resultWithMedical)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.temperature).toBe(36.5)
      expect(body.systolic).toBe(120)
      expect(body.diastolic).toBe(80)
      expect(body.pulse).toBe(72)
      expect(body.medical_measured_at).toBe('2026-01-15T07:55:00.000Z')
      expect(body.face_photo_url).toBe('https://existing.com/photo.jpg')
    })
  })

  // ============================================================
  // getMeasurements (manual URLSearchParams)
  // ============================================================

  describe('getMeasurements', () => {
    it('should GET /api/measurements with no filters', async () => {
      const apiResponse = { measurements: [], total: 0, page: 1, per_page: 20 }
      mockFetch.mockResolvedValueOnce(okJson(apiResponse))

      await getMeasurements()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/measurements',
        expect.anything(),
      )
    })

    it('should apply filters as query parameters', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ measurements: [], total: 0, page: 1, per_page: 20 }))

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

    it('should include status filter', async () => {
      mockFetch.mockResolvedValueOnce(okJson({ measurements: [], total: 0, page: 1, per_page: 20 }))

      await getMeasurements({ status: 'started' })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('status=started')
    })
  })

  // ============================================================
  // Simple GET functions (it.each)
  // ============================================================

  describe('simple GET functions', () => {
    it.each([
      ['getEmployees', () => getEmployees(), '/api/employees'],
      ['getEmployeeByNfcId', () => getEmployeeByNfcId('ABC'), '/api/employees/by-nfc/ABC'],
      ['getEmployeeByCode', () => getEmployeeByCode('C1'), '/api/employees/by-code/C1'],
      ['getEmployeeById', () => getEmployeeById('id1'), '/api/employees/id1'],
      ['getFaceData', () => getFaceData(), '/api/employees/face-data'],
      ['getMeasurement', () => getMeasurement('m1'), '/api/measurements/m1'],
      ['getSchedule', () => getSchedule('s1'), '/api/tenko/schedules/s1'],
      ['getPendingSchedules', () => getPendingSchedules('e1'), '/api/tenko/schedules/pending/e1'],
      ['getTenkoSession', () => getTenkoSession('ts1'), '/api/tenko/sessions/ts1'],
      ['getTenkoRecord', () => getTenkoRecord('tr1'), '/api/tenko/records/tr1'],
      ['getTenkoDashboard', () => getTenkoDashboard(), '/api/tenko/dashboard'],
      ['listWebhooks', () => listWebhooks(), '/api/tenko/webhooks'],
      ['getWebhook', () => getWebhook('w1'), '/api/tenko/webhooks/w1'],
      ['getWebhookDeliveries', () => getWebhookDeliveries('wc1'), '/api/tenko/webhooks/wc1/deliveries'],
      ['listBaselines', () => listBaselines(), '/api/tenko/health-baselines'],
      ['getBaseline', () => getBaseline('e1'), '/api/tenko/health-baselines/e1'],
      ['getFailure', () => getFailure('f1'), '/api/tenko/equipment-failures/f1'],
      ['getTimecardCardByCardId', () => getTimecardCardByCardId('c1'), '/api/timecard/cards/by-card/c1'],
      ['listDevices', () => listDevices(), '/api/devices'],
      ['listPendingDeviceRegistrations', () => listPendingDeviceRegistrations(), '/api/devices/pending'],
      ['checkDeviceRegistrationStatus', () => checkDeviceRegistrationStatus('code1'), '/api/devices/register/status/code1'],
      ['getDeviceSettings', () => getDeviceSettings('d1'), '/api/devices/settings/d1'],
      ['getCarryingItems', () => getCarryingItems(), '/api/carrying-items'],
      ['getDriverInfo', () => getDriverInfo('e1'), '/api/tenko/driver-info/e1'],
      ['getDtakoDrivers', () => getDtakoDrivers(), '/api/drivers'],
      ['getVehicleCategories', () => getVehicleCategories(), '/api/car-inspections/vehicle-categories'],
    ] as [string, () => Promise<unknown>, string][])(
      '%s → GET %s',
      async (_name, fn, expectedPath) => {
        mockFetch.mockResolvedValueOnce(okJson({}))
        await fn()
        expect(mockFetch).toHaveBeenCalledWith(
          `https://api.example.com${expectedPath}`,
          expect.objectContaining({
            headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          }),
        )
        // Verify GET (no method means GET)
        const opts = mockFetch.mock.calls[0][1]
        expect(opts.method).toBeUndefined()
      },
    )
  })

  // ============================================================
  // GET with filter (toParams) functions
  // ============================================================

  describe('GET with filter functions', () => {
    it.each([
      ['listSchedules', () => listSchedules({}), '/api/tenko/schedules'],
      ['listTenkoSessions', () => listTenkoSessions({}), '/api/tenko/sessions'],
      ['listTenkoRecords', () => listTenkoRecords({}), '/api/tenko/records'],
      ['listFailures', () => listFailures({}), '/api/tenko/equipment-failures'],
      ['listTimePunches', () => listTimePunches({}), '/api/timecard/punches'],
      ['listGuidanceRecords', () => listGuidanceRecords({}), '/api/guidance-records'],
      ['listCommunicationItems', () => listCommunicationItems({}), '/api/communication-items'],
      ['getDtakoDailyHours', () => getDtakoDailyHours({}), '/api/daily-hours'],
    ] as [string, () => Promise<unknown>, string][])(
      '%s({}) → GET %s',
      async (_name, fn, expectedPath) => {
        mockFetch.mockResolvedValueOnce(okJson({}))
        await fn()
        expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com${expectedPath}`)
      },
    )

    it('listTimecardCards without employeeId', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]))
      await listTimecardCards()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/timecard/cards')
    })

    it('listTimecardCards with employeeId', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]))
      await listTimecardCards('emp1')
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/timecard/cards?employee_id=emp1')
    })

    it('getDailyHealthStatus without date', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await getDailyHealthStatus()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/tenko/daily-health-status')
    })

    it('getDailyHealthStatus with date', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await getDailyHealthStatus('2026-01-15')
      expect(mockFetch.mock.calls[0][0]).toContain('date=2026-01-15')
    })

    it('getActiveCommunicationItems without targetEmployeeId', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]))
      await getActiveCommunicationItems()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/communication-items/active')
    })

    it('getActiveCommunicationItems with targetEmployeeId', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]))
      await getActiveCommunicationItems('emp1')
      expect(mockFetch.mock.calls[0][0]).toContain('target_employee_id=emp1')
    })
  })

  // ============================================================
  // POST functions (it.each)
  // ============================================================

  describe('POST functions', () => {
    it.each([
      ['startMeasurement', () => startMeasurement('e1'), '/api/measurements/start'],
      ['createEmployee', () => createEmployee({ name: 'A' }), '/api/employees'],
      ['createSchedule', () => createSchedule({} as any), '/api/tenko/schedules'],
      ['batchCreateSchedules', () => batchCreateSchedules([]), '/api/tenko/schedules/batch'],
      ['startTenkoSession', () => startTenkoSession({} as any), '/api/tenko/sessions/start'],
      ['cancelTenkoSession', () => cancelTenkoSession('s1', {} as any), '/api/tenko/sessions/s1/cancel'],
      ['interruptTenkoSession', () => interruptTenkoSession('s1'), '/api/tenko/sessions/s1/interrupt'],
      ['resumeTenkoSession', () => resumeTenkoSession('s1', {} as any), '/api/tenko/sessions/s1/resume'],
      ['createWebhook', () => createWebhook({} as any), '/api/tenko/webhooks'],
      ['createBaseline', () => createBaseline({} as any), '/api/tenko/health-baselines'],
      ['createFailure', () => createFailure({} as any), '/api/tenko/equipment-failures'],
      ['createTimecardCard', () => createTimecardCard({} as any), '/api/timecard/cards'],
      ['punchTimecard', () => punchTimecard('c1'), '/api/timecard/punch'],
      ['createDeviceRegistrationRequest', () => createDeviceRegistrationRequest(), '/api/devices/register/request'],
      ['claimDeviceRegistration', () => claimDeviceRegistration({} as any), '/api/devices/register/claim'],
      ['createDeviceUrlToken', () => createDeviceUrlToken(), '/api/devices/register/create-token'],
      ['createPermanentQr', () => createPermanentQr(), '/api/devices/register/create-permanent-qr'],
      ['createDeviceOwnerToken', () => createDeviceOwnerToken(), '/api/devices/register/create-device-owner-token'],
      ['approveDevice', () => approveDevice('d1'), '/api/devices/approve/d1'],
      ['approveDeviceByCode', () => approveDeviceByCode('c1'), '/api/devices/approve-by-code/c1'],
      ['rejectDevice', () => rejectDevice('d1'), '/api/devices/reject/d1'],
      ['disableDevice', () => disableDevice('d1'), '/api/devices/disable/d1'],
      ['enableDevice', () => enableDevice('d1'), '/api/devices/enable/d1'],
      ['testFcmNotification', () => testFcmNotification('d1'), '/api/devices/d1/test-fcm'],
      ['testFcmAll', () => testFcmAll(), '/api/devices/test-fcm-all'],
      ['triggerUpdate', () => triggerUpdate(), '/api/devices/trigger-update'],
      ['createCarryingItem', () => createCarryingItem({} as any), '/api/carrying-items'],
      ['createGuidanceRecord', () => createGuidanceRecord({} as any), '/api/guidance-records'],
      ['createCommunicationItem', () => createCommunicationItem({} as any), '/api/communication-items'],
    ] as [string, () => Promise<unknown>, string][])(
      '%s → POST %s',
      async (_name, fn, expectedPath) => {
        mockFetch.mockResolvedValueOnce(okJson({}))
        await fn()
        expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com${expectedPath}`)
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
      },
    )

    it('punchTimecard with deviceId', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await punchTimecard('c1', 'dev1')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.card_id).toBe('c1')
      expect(body.device_id).toBe('dev1')
    })

    it('punchTimecard with null deviceId omits device_id', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await punchTimecard('c1', null)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.device_id).toBeUndefined()
    })

    it('createDeviceRegistrationRequest with deviceName', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await createDeviceRegistrationRequest('My Device')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.device_name).toBe('My Device')
    })

    it('createDeviceUrlToken with opts', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await createDeviceUrlToken('dev', { is_device_owner: true, is_dev_device: true })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.device_name).toBe('dev')
      expect(body.is_device_owner).toBe(true)
      expect(body.is_dev_device).toBe(true)
    })

    it('createPermanentQr with opts', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await createPermanentQr('dev', { is_device_owner: true })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.device_name).toBe('dev')
      expect(body.is_device_owner).toBe(true)
    })

    it('createDeviceOwnerToken with opts', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await createDeviceOwnerToken('dev', { is_dev_device: true })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.device_name).toBe('dev')
      expect(body.is_dev_device).toBe(true)
    })

    it('approveDevice with deviceName', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await approveDevice('d1', 'Named Device')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.device_name).toBe('Named Device')
    })

    it('triggerUpdate with opts', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await triggerUpdate({ device_ids: ['d1', 'd2'], dev_only: true })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.device_ids).toEqual(['d1', 'd2'])
      expect(body.dev_only).toBe(true)
    })

    it('batchCreateSchedules sends schedules array in body', async () => {
      mockFetch.mockResolvedValueOnce(okJson([]))
      const schedules = [{ employee_id: 'e1' }] as any
      await batchCreateSchedules(schedules)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.schedules).toEqual(schedules)
    })
  })

  // ============================================================
  // PUT functions (it.each)
  // ============================================================

  describe('PUT functions', () => {
    it.each([
      ['updateMeasurement', () => updateMeasurement('m1', { alcohol_value: 0.1 }), '/api/measurements/m1'],
      ['updateEmployee', () => updateEmployee('e1', { name: 'B' }), '/api/employees/e1'],
      ['updateEmployeeFace', () => updateEmployeeFace('e1', 'url', [1, 2], 'v1'), '/api/employees/e1/face'],
      ['approveFace', () => approveFace('e1'), '/api/employees/e1/face/approve'],
      ['rejectFace', () => rejectFace('e1'), '/api/employees/e1/face/reject'],
      ['updateEmployeeNfcId', () => updateEmployeeNfcId('e1', 'nfc1'), '/api/employees/e1/nfc'],
      ['updateEmployeeLicense', () => updateEmployeeLicense('e1', '2026-01-01', '2028-01-01'), '/api/employees/e1/license'],
      ['updateSchedule', () => updateSchedule('s1', {} as any), '/api/tenko/schedules/s1'],
      ['submitAlcohol', () => submitAlcohol('ss1', {} as any), '/api/tenko/sessions/ss1/alcohol'],
      ['submitMedical', () => submitMedical('ss1', {} as any), '/api/tenko/sessions/ss1/medical'],
      ['submitSelfDeclaration', () => submitSelfDeclaration('ss1', {} as any), '/api/tenko/sessions/ss1/self-declaration'],
      ['submitDailyInspection', () => submitDailyInspection('ss1', {} as any), '/api/tenko/sessions/ss1/daily-inspection'],
      ['confirmInstruction', () => confirmInstruction('ss1'), '/api/tenko/sessions/ss1/instruction-confirm'],
      ['submitReport', () => submitReport('ss1', {} as any), '/api/tenko/sessions/ss1/report'],
      ['updateBaseline', () => updateBaseline('e1', {} as any), '/api/tenko/health-baselines/e1'],
      ['resolveFailure', () => resolveFailure('f1', {} as any), '/api/tenko/equipment-failures/f1'],
      ['submitCarryingItemChecks', () => submitCarryingItemChecks('ss1', []), '/api/tenko/sessions/ss1/carrying-items'],
      ['updateCarryingItem', () => updateCarryingItem('ci1', {} as any), '/api/carrying-items/ci1'],
      ['updateCommunicationItem', () => updateCommunicationItem('cc1', {}), '/api/communication-items/cc1'],
      ['updateDeviceCallSettings', () => updateDeviceCallSettings('d1', true), '/api/devices/d1/call-settings'],
      ['updateDeviceLastLogin', () => updateDeviceLastLogin('d1', 'e1', 'name', []), '/api/devices/update-last-login'],
    ] as [string, () => Promise<unknown>, string][])(
      '%s → PUT %s',
      async (_name, fn, expectedPath) => {
        mockFetch.mockResolvedValueOnce(okJson({}))
        await fn()
        expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com${expectedPath}`)
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
      },
    )

    it('updateEmployeeFace sends correct body with null defaults', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await updateEmployeeFace('e1')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.face_photo_url).toBeNull()
      expect(body.face_embedding).toBeNull()
      expect(body.face_model_version).toBeNull()
    })

    it('updateEmployeeNfcId sends correct body', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await updateEmployeeNfcId('e1', 'NFC123')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.nfc_id).toBe('NFC123')
    })

    it('updateEmployeeLicense sends null defaults', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await updateEmployeeLicense('e1')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.license_issue_date).toBeNull()
      expect(body.license_expiry_date).toBeNull()
    })

    it('updateDeviceCallSettings with callSchedule and alwaysOn', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      const schedule = { start: '08:00', end: '18:00' }
      await updateDeviceCallSettings('d1', true, schedule as any, true)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.call_enabled).toBe(true)
      expect(body.call_schedule).toEqual(schedule)
      expect(body.always_on).toBe(true)
    })

    it('updateDeviceCallSettings without alwaysOn omits always_on', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await updateDeviceCallSettings('d1', false, null)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.call_enabled).toBe(false)
      expect(body.call_schedule).toBeNull()
      expect(body).not.toHaveProperty('always_on')
    })

    it('updateDeviceLastLogin sends correct body', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await updateDeviceLastLogin('d1', 'e1', 'Taro', ['admin'])
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.device_id).toBe('d1')
      expect(body.employee_id).toBe('e1')
      expect(body.employee_name).toBe('Taro')
      expect(body.employee_role).toEqual(['admin'])
    })

    it('submitCarryingItemChecks sends checks in body', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      const checks = [{ item_id: 'i1', checked: true }]
      await submitCarryingItemChecks('ss1', checks as any)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.checks).toEqual(checks)
    })

    it('confirmInstruction sends empty body', async () => {
      mockFetch.mockResolvedValueOnce(okJson({}))
      await confirmInstruction('ss1')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body).toEqual({})
    })
  })

  // ============================================================
  // DELETE functions (it.each)
  // ============================================================

  describe('DELETE functions', () => {
    it.each([
      ['deleteEmployee', () => deleteEmployee('e1'), '/api/employees/e1'],
      ['deleteSchedule', () => deleteSchedule('s1'), '/api/tenko/schedules/s1'],
      ['deleteWebhook', () => deleteWebhook('w1'), '/api/tenko/webhooks/w1'],
      ['deleteBaseline', () => deleteBaseline('e1'), '/api/tenko/health-baselines/e1'],
      ['deleteTimecardCard', () => deleteTimecardCard('tc1'), '/api/timecard/cards/tc1'],
      ['deleteDevice', () => deleteDevice('d1'), '/api/devices/d1'],
      ['deleteCarryingItem', () => deleteCarryingItem('ci1'), '/api/carrying-items/ci1'],
      ['deleteGuidanceRecord', () => deleteGuidanceRecord('gr1'), '/api/guidance-records/gr1'],
      ['deleteGuidanceAttachment', () => deleteGuidanceAttachment('gr1', 'at1'), '/api/guidance-records/gr1/attachments/at1'],
      ['deleteCommunicationItem', () => deleteCommunicationItem('cc1'), '/api/communication-items/cc1'],
    ] as [string, () => Promise<unknown>, string][])(
      '%s → DELETE %s',
      async (_name, fn, expectedPath) => {
        mockFetch.mockResolvedValueOnce(ok204())
        await fn()
        expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com${expectedPath}`)
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
      },
    )
  })

  // ============================================================
  // FormData upload functions
  // ============================================================

  describe('uploadFacePhoto', () => {
    it('should upload and return URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://r2.example.com/face.jpg' }),
      })

      const blob = new Blob(['photo'], { type: 'image/jpeg' })
      const url = await uploadFacePhoto(blob)
      expect(url).toBe('https://r2.example.com/face.jpg')

      const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0]
      expect(fetchUrl).toBe('https://api.example.com/api/upload/face-photo')
      expect(fetchOpts.method).toBe('POST')
      expect(fetchOpts.body).toBeInstanceOf(FormData)
    })

    it('should throw on upload error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 413 })
      const blob = new Blob(['photo'])
      await expect(uploadFacePhoto(blob)).rejects.toThrow('アップロード失敗 (413)')
    })

    it('should throw if API not initialized', async () => {
      initApi('')
      const blob = new Blob(['photo'])
      await expect(uploadFacePhoto(blob)).rejects.toThrow('API 未初期化')
    })
  })

  describe('uploadReportAudio', () => {
    it('should upload and return URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://r2.example.com/report.webm' }),
      })

      const blob = new Blob(['audio'], { type: 'audio/webm' })
      const url = await uploadReportAudio(blob)
      expect(url).toBe('https://r2.example.com/report.webm')

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/upload/report-audio')
    })

    it('should throw on upload error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      const blob = new Blob(['audio'])
      await expect(uploadReportAudio(blob)).rejects.toThrow('音声アップロード失敗 (500)')
    })

    it('should throw if API not initialized', async () => {
      initApi('')
      const blob = new Blob(['audio'])
      await expect(uploadReportAudio(blob)).rejects.toThrow('API 未初期化')
    })
  })

  describe('uploadBlowVideo', () => {
    it('should upload and return URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://r2.example.com/blow.webm' }),
      })

      const blob = new Blob(['video'], { type: 'video/webm' })
      const url = await uploadBlowVideo(blob)
      expect(url).toBe('https://r2.example.com/blow.webm')

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/upload/blow-video')
    })

    it('should throw on upload error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      const blob = new Blob(['video'])
      await expect(uploadBlowVideo(blob)).rejects.toThrow('録画アップロード失敗 (500)')
    })

    it('should throw if API not initialized', async () => {
      initApi('')
      const blob = new Blob(['video'])
      await expect(uploadBlowVideo(blob)).rejects.toThrow('API 未初期化')
    })
  })

  describe('uploadGuidanceAttachment', () => {
    it('should upload and return attachment data', async () => {
      const attachmentData = { id: 'att1', filename: 'doc.pdf' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(attachmentData),
      })

      const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
      const result = await uploadGuidanceAttachment('gr1', file)
      expect(result).toEqual(attachmentData)

      const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0]
      expect(fetchUrl).toBe('https://api.example.com/api/guidance-records/gr1/attachments')
      expect(fetchOpts.method).toBe('POST')
      expect(fetchOpts.body).toBeInstanceOf(FormData)
    })

    it('should throw on upload error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 })
      const file = new File(['content'], 'doc.pdf')
      await expect(uploadGuidanceAttachment('gr1', file)).rejects.toThrow('Upload failed: 400')
    })

    it('should throw if API not initialized', async () => {
      initApi('')
      const file = new File(['content'], 'doc.pdf')
      await expect(uploadGuidanceAttachment('gr1', file)).rejects.toThrow('API 未初期化')
    })
  })

  // ============================================================
  // fetchFacePhoto
  // ============================================================

  describe('fetchFacePhoto', () => {
    beforeEach(() => {
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:http://localhost/abc'),
        revokeObjectURL: vi.fn(),
      })
    })

    it('should return object URL on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['photo'])),
      })

      const result = await fetchFacePhoto('m1')
      expect(result).toBe('blob:http://localhost/abc')
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/measurements/m1/face-photo')
    })

    it('should return null when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      const result = await fetchFacePhoto('m1')
      expect(result).toBeNull()
    })

    it('should return null when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'))
      const result = await fetchFacePhoto('m1')
      expect(result).toBeNull()
    })

    it('should return null when apiBase is empty', async () => {
      initApi('')
      const result = await fetchFacePhoto('m1')
      expect(result).toBeNull()
    })
  })

  // ============================================================
  // downloadCsv functions
  // ============================================================

  describe('CSV download functions', () => {
    let mockCreateElement: ReturnType<typeof vi.fn>
    let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:http://localhost/csv'),
        revokeObjectURL: vi.fn(),
      })
      mockAnchor = { href: '', download: '', click: vi.fn() }
      mockCreateElement = vi.fn(() => mockAnchor)
      vi.stubGlobal('document', { createElement: mockCreateElement })
    })

    it('downloadTenkoRecordsCsv should download CSV', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['csv'])),
      })

      await downloadTenkoRecordsCsv({})

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/tenko/records/csv')
      expect(mockAnchor.download).toBe('tenko-records.csv')
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/csv')
    })

    it('downloadFailuresCsv should download CSV', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['csv'])),
      })

      await downloadFailuresCsv({})

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/tenko/equipment-failures/csv')
      expect(mockAnchor.download).toBe('equipment-failures.csv')
    })

    it('downloadTimePunchesCsv should download CSV', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['csv'])),
      })

      await downloadTimePunchesCsv({})

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/timecard/punches/csv')
      expect(mockAnchor.download).toBe('time-punches.csv')
    })

    it('downloadCsv should throw on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('error body'),
      })

      await expect(downloadTenkoRecordsCsv({})).rejects.toThrow('CSV ダウンロード失敗 (500)')
    })

    it('downloadCsv should use statusText when text() fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: () => Promise.reject(new Error('fail')),
      })

      await expect(downloadTenkoRecordsCsv({})).rejects.toThrow('CSV ダウンロード失敗 (502)')
    })

    it('downloadCsv should throw if API not initialized', async () => {
      initApi('')
      await expect(downloadTenkoRecordsCsv({})).rejects.toThrow('API 未初期化')
    })

    it('downloadTenkoRecordsCsv with filter params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['csv'])),
      })

      await downloadTenkoRecordsCsv({ employee_id: 'e1' } as any)
      expect(mockFetch.mock.calls[0][0]).toContain('employee_id=e1')
    })

    it('downloadCsv should use statusText fallback when body is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(''),
      })

      await expect(downloadTenkoRecordsCsv({})).rejects.toThrow('Forbidden')
    })
  })
})
