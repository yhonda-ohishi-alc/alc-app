import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest'
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
import {
  isLive, mockFetch, okJson, ok204, errResponse,
  stubOk, stub204, stubResponse, stubReject, assertMock, expectMock, setupApi, teardownApi, API_BASE,
} from '../helpers/api-test-env'
import {
  TEST_EMPLOYEE_ID, TEST_TENANT_ID,
  createScheduleBody, createEquipmentFailureBody, createWebhookBody,
  createCarryingItemBody, createGuidanceRecordBody, createCommunicationItemBody,
  createHealthBaselineBody, createTimecardCardBody, startTenkoSessionBody, createEmployeeBody,
} from '../helpers/api-test-data'

// Valid UUIDs for live-mode compatibility
const UUID1 = '00000000-0000-0000-0000-000000000001'
const UUID2 = '00000000-0000-0000-0000-000000000002'
const UUID3 = '00000000-0000-0000-0000-000000000003'
const UUID4 = '00000000-0000-0000-0000-000000000004'
const UUID5 = '00000000-0000-0000-0000-000000000005'
const UUID6 = '00000000-0000-0000-0000-000000000006'
const UUID7 = '00000000-0000-0000-0000-000000000007'
const UUID8 = '00000000-0000-0000-0000-000000000008'
const UUID9 = '00000000-0000-0000-0000-000000000009'
const UUID10 = '00000000-0000-0000-0000-000000000010'

describe('api', () => {
  beforeAll(async () => {
    if (isLive) await setupApi()
  })

  beforeEach(async () => {
    await setupApi()
  })

  afterEach(() => {
    teardownApi()
  })

  // ============================================================
  // initApi / request() internals
  // ============================================================

  describe.skipIf(isLive)('initApi and request internals', () => {
    it('should throw if API is not initialized (empty baseUrl)', async () => {
      initApi('')
      await expect(getEmployees()).rejects.toThrow('API 未初期化')
    })

    it('should strip trailing slash from baseUrl', async () => {
      initApi('https://api.example.com/', undefined, () => 'test-tenant')
      stubOk([])
      await getEmployees()
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/employees') })
    })

    it('should return undefined for 204 No Content', async () => {
      stub204()
      const result = await deleteSchedule('s1')
      expect(result).toBeUndefined()
    })

    it('should include status code in error message', async () => {
      stubResponse(errResponse(404, 'not found'))
      await expect(getMeasurement('nonexistent')).rejects.toThrow('API エラー (404)')
    })

    it('should use statusText when body is empty', async () => {
      stubResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve(''),
      })
      await expect(getEmployees()).rejects.toThrow('Internal Server Error')
    })

    it('should handle text() rejection gracefully', async () => {
      stubResponse({
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

  describe.skipIf(isLive)('authentication headers', () => {
    it('should send Authorization header when JWT is available', async () => {
      initApi('https://api.example.com', () => 'jwt-token-123', () => 'test-tenant')
      stubOk([])

      await getEmployees()

      expectMock(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/employees',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer jwt-token-123',
          }),
        }),
      )
      // JWT 優先のため X-Tenant-ID は送信されない
      assertMock(() => {
        const headers = mockFetch.mock.calls[0][1].headers
        expect(headers['X-Tenant-ID']).toBeUndefined()
      })
    })

    it('should fall back to X-Tenant-ID when no JWT is available', async () => {
      initApi('https://api.example.com', () => null, () => 'kiosk-tenant-id')
      stubOk([])

      await getEmployees()

      assertMock(() => {
        const headers = mockFetch.mock.calls[0][1].headers
        expect(headers['X-Tenant-ID']).toBe('kiosk-tenant-id')
        expect(headers['Authorization']).toBeUndefined()
      })
    })

    it('should send no auth headers when both getters return null', async () => {
      initApi('https://api.example.com', () => null, () => null)
      stubOk([])

      await getEmployees()

      assertMock(() => {
        const headers = mockFetch.mock.calls[0][1].headers
        expect(headers['X-Tenant-ID']).toBeUndefined()
        expect(headers['Authorization']).toBeUndefined()
      })
    })

    it('should send no auth headers when getters are not provided', async () => {
      initApi('https://api.example.com')
      stubOk([])

      await getEmployees()

      assertMock(() => {
        const headers = mockFetch.mock.calls[0][1].headers
        expect(headers['X-Tenant-ID']).toBeUndefined()
        expect(headers['Authorization']).toBeUndefined()
      })
    })

    it('should fall back to X-Tenant-ID when JWT getter not provided but tenant getter returns value', async () => {
      initApi('https://api.example.com', undefined, () => 'tenant-only')
      stubOk([])

      await getEmployees()

      assertMock(() => {
        const headers = mockFetch.mock.calls[0][1].headers
        expect(headers['X-Tenant-ID']).toBe('tenant-only')
      })
    })
  })

  // ============================================================
  // 401 Token refresh
  // ============================================================

  describe.skipIf(isLive)('401 token refresh', () => {
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
      expectMock(mockFetch).toHaveBeenCalledTimes(2)
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
      expectMock(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should fall through to original error when refresher rejects', async () => {
      const refresher = vi.fn(async () => { throw new Error('refresh failed') })
      initApi('https://api.example.com', () => 'token', undefined, refresher)

      stubResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('unauthorized'),
      })

      await expect(getEmployees()).rejects.toThrow('API エラー (401)')
    })

    it('should not attempt refresh when no tokenRefresher is set', async () => {
      initApi('https://api.example.com', () => 'token')
      stubResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(''),
      })

      await expect(getEmployees()).rejects.toThrow('API エラー (401)')
      expectMock(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should not attempt refresh when getAccessToken returns null', async () => {
      const refresher = vi.fn(async () => {})
      initApi('https://api.example.com', () => null, () => 'tenant', refresher)
      stubResponse({
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
      stubResponse({ ok: false, status: 401, statusText: 'Unauthorized', text: () => Promise.resolve('') })

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

  describe.skipIf(isLive)('toParams (via filter-based functions)', () => {
    it('should exclude null and empty string values', async () => {
      stubOk({ schedules: [], total: 0 })
      await listSchedules({ employee_id: '', status: undefined as any })
      assertMock(() => {
        const url = mockFetch.mock.calls[0][0] as string
        expect(url).toBe('https://api.example.com/api/tenko/schedules')
      })
    })

    it('should include non-empty values', async () => {
      stubOk({ schedules: [], total: 0 })
      await listSchedules({ employee_id: TEST_EMPLOYEE_ID, status: 'pending' } as any)
      assertMock(() => {
        const url = mockFetch.mock.calls[0][0] as string
        expect(url).toContain(`employee_id=${TEST_EMPLOYEE_ID}`)
        expect(url).toContain('status=pending')
      })
    })
  })

  // ============================================================
  // saveMeasurement
  // ============================================================

  describe('saveMeasurement', () => {
    const baseResult: MeasurementResult = {
      employeeId: TEST_EMPLOYEE_ID,
      alcoholValue: 0.0,
      resultType: 'normal',
      deviceUseCount: 100,
      measuredAt: new Date('2026-01-15T08:00:00Z'),
    }

    it('should POST measurement to /api/measurements', async () => {
      const apiResponse = {
        id: '123',
        tenant_id: 'test',
        employee_id: TEST_EMPLOYEE_ID,
        alcohol_value: 0.0,
        result_type: 'normal',
        device_use_count: 100,
        measured_at: '2026-01-15T08:00:00Z',
        created_at: '2026-01-15T08:00:01Z',
      }
      stubOk(apiResponse)

      const response = await saveMeasurement(baseResult)

      expectMock(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/measurements',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Tenant-ID': 'test-tenant',
          }),
        }),
      )

      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.employee_id).toBe(TEST_EMPLOYEE_ID)
        expect(body.alcohol_value).toBe(0.0)
        expect(body.result_type).toBe('normal')
      })
      expect(response.id).toBeDefined()
      assertMock(() => expect(response.id).toBe('123'))
    })

    it.skipIf(isLive)('should throw on API error', async () => {
      stubResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('server error'),
      })

      await expect(saveMeasurement(baseResult)).rejects.toThrow('API エラー (500)')
    })

    it.skipIf(isLive)('should upload face photo and include URL when facePhotoBlob is provided', async () => {
      // First call: uploadFacePhoto (direct fetch)
      stubResponse({
        ok: true,
        json: () => Promise.resolve({ url: 'https://r2.example.com/face.jpg' }),
      })
      // Second call: saveMeasurement via request()
      stubOk({ id: '123' })

      const blob = new Blob(['photo'], { type: 'image/jpeg' })
      await saveMeasurement(baseResult, blob)

      expectMock(mockFetch).toHaveBeenCalledTimes(2)
      // Verify the measurement body has the uploaded face_photo_url
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[1][1].body)
        expect(body.face_photo_url).toBe('https://r2.example.com/face.jpg')
      })
    })

    it('should include optional medical fields in body', async () => {
      stubOk({ id: '456' })

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

      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.temperature).toBe(36.5)
        expect(body.systolic).toBe(120)
        expect(body.diastolic).toBe(80)
        expect(body.pulse).toBe(72)
        expect(body.medical_measured_at).toBe('2026-01-15T07:55:00.000Z')
        expect(body.face_photo_url).toBe('https://existing.com/photo.jpg')
      })
    })
  })

  // ============================================================
  // getMeasurements (manual URLSearchParams)
  // ============================================================

  describe.skipIf(isLive)('getMeasurements', () => {
    it('should GET /api/measurements with no filters', async () => {
      const apiResponse = { measurements: [], total: 0, page: 1, per_page: 20 }
      stubOk(apiResponse)

      await getMeasurements()
      expectMock(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/measurements',
        expect.anything(),
      )
    })

    it('should apply filters as query parameters', async () => {
      stubOk({ measurements: [], total: 0, page: 1, per_page: 20 })

      await getMeasurements({
        employee_id: 'EMP001',
        result_type: 'over',
        date_from: '2026-01-01',
        date_to: '2026-01-31',
        page: 2,
        per_page: 10,
      })

      assertMock(() => {
        const url = mockFetch.mock.calls[0][0]
        expect(url).toContain('employee_id=EMP001')
        expect(url).toContain('result_type=over')
        expect(url).toContain('date_from=2026-01-01')
        expect(url).toContain('date_to=2026-01-31')
        expect(url).toContain('page=2')
        expect(url).toContain('per_page=10')
      })
    })

    it('should include status filter', async () => {
      stubOk({ measurements: [], total: 0, page: 1, per_page: 20 })

      await getMeasurements({ status: 'started' })

      assertMock(() => {
        const url = mockFetch.mock.calls[0][0] as string
        expect(url).toContain('status=started')
      })
    })
  })

  // ============================================================
  // Simple GET functions (it.each)
  // ============================================================

  describe.skipIf(isLive)('simple GET functions', () => {
    it.each([
      ['getEmployees', () => getEmployees(), '/api/employees'],
      ['getEmployeeByNfcId', () => getEmployeeByNfcId('ABC'), '/api/employees/by-nfc/ABC'],
      ['getEmployeeByCode', () => getEmployeeByCode('C1'), '/api/employees/by-code/C1'],
      ['getEmployeeById', () => getEmployeeById(TEST_EMPLOYEE_ID), `/api/employees/${TEST_EMPLOYEE_ID}`],
      ['getFaceData', () => getFaceData(), '/api/employees/face-data'],
      ['getMeasurement', () => getMeasurement(UUID1), `/api/measurements/${UUID1}`],
      ['getSchedule', () => getSchedule(UUID2), `/api/tenko/schedules/${UUID2}`],
      ['getPendingSchedules', () => getPendingSchedules(TEST_EMPLOYEE_ID), `/api/tenko/schedules/pending/${TEST_EMPLOYEE_ID}`],
      ['getTenkoSession', () => getTenkoSession(UUID3), `/api/tenko/sessions/${UUID3}`],
      ['getTenkoRecord', () => getTenkoRecord(UUID4), `/api/tenko/records/${UUID4}`],
      ['getTenkoDashboard', () => getTenkoDashboard(), '/api/tenko/dashboard'],
      ['listWebhooks', () => listWebhooks(), '/api/tenko/webhooks'],
      ['getWebhook', () => getWebhook(UUID5), `/api/tenko/webhooks/${UUID5}`],
      ['getWebhookDeliveries', () => getWebhookDeliveries(UUID5), `/api/tenko/webhooks/${UUID5}/deliveries`],
      ['listBaselines', () => listBaselines(), '/api/tenko/health-baselines'],
      ['getBaseline', () => getBaseline(TEST_EMPLOYEE_ID), `/api/tenko/health-baselines/${TEST_EMPLOYEE_ID}`],
      ['getFailure', () => getFailure(UUID6), `/api/tenko/equipment-failures/${UUID6}`],
      ['getTimecardCardByCardId', () => getTimecardCardByCardId('NFC-TEST-001'), '/api/timecard/cards/by-card/NFC-TEST-001'],
      ['listDevices', () => listDevices(), '/api/devices'],
      ['listPendingDeviceRegistrations', () => listPendingDeviceRegistrations(), '/api/devices/pending'],
      ['checkDeviceRegistrationStatus', () => checkDeviceRegistrationStatus('code1'), '/api/devices/register/status/code1'],
      ['getDeviceSettings', () => getDeviceSettings(UUID7), `/api/devices/settings/${UUID7}`],
      ['getCarryingItems', () => getCarryingItems(), '/api/carrying-items'],
      ['getDriverInfo', () => getDriverInfo(TEST_EMPLOYEE_ID), `/api/tenko/driver-info/${TEST_EMPLOYEE_ID}`],
      ['getDtakoDrivers', () => getDtakoDrivers(), '/api/drivers'],
      ['getVehicleCategories', () => getVehicleCategories(), '/api/car-inspections/vehicle-categories'],
    ] as [string, () => Promise<unknown>, string][])(
      '%s → GET %s',
      async (_name, fn, expectedPath) => {
        stubOk({})
        await fn()
        expectMock(mockFetch).toHaveBeenCalledWith(
          `https://api.example.com${expectedPath}`,
          expect.objectContaining({
            headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          }),
        )
        // Verify GET (no method means GET)
        assertMock(() => {
          const opts = mockFetch.mock.calls[0][1]
          expect(opts.method).toBeUndefined()
        })
      },
    )
  })

  // ============================================================
  // GET with filter (toParams) functions
  // ============================================================

  describe.skipIf(isLive)('GET with filter functions', () => {
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
        stubOk({})
        await fn()
        assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com${expectedPath}`) })
      },
    )

    it('listTimecardCards without employeeId', async () => {
      stubOk([])
      await listTimecardCards()
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/timecard/cards') })
    })

    it('listTimecardCards with employeeId', async () => {
      stubOk([])
      await listTimecardCards(TEST_EMPLOYEE_ID)
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com/api/timecard/cards?employee_id=${TEST_EMPLOYEE_ID}`) })
    })

    it('getDailyHealthStatus without date', async () => {
      stubOk({})
      await getDailyHealthStatus()
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/tenko/daily-health-status') })
    })

    it('getDailyHealthStatus with date', async () => {
      stubOk({})
      await getDailyHealthStatus('2026-01-15')
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toContain('date=2026-01-15') })
    })

    it('getActiveCommunicationItems without targetEmployeeId', async () => {
      stubOk([])
      await getActiveCommunicationItems()
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/communication-items/active') })
    })

    it('getActiveCommunicationItems with targetEmployeeId', async () => {
      stubOk([])
      await getActiveCommunicationItems(TEST_EMPLOYEE_ID)
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toContain(`target_employee_id=${TEST_EMPLOYEE_ID}`) })
    })
  })

  // ============================================================
  // POST functions (it.each)
  // ============================================================

  describe.skipIf(isLive)('POST functions', () => {
    it.each([
      ['startMeasurement', () => startMeasurement(TEST_EMPLOYEE_ID), '/api/measurements/start'],
      ['createEmployee', () => createEmployee(createEmployeeBody), '/api/employees'],
      ['createSchedule', () => createSchedule(createScheduleBody as any), '/api/tenko/schedules'],
      ['batchCreateSchedules', () => batchCreateSchedules([createScheduleBody] as any), '/api/tenko/schedules/batch'],
      ['startTenkoSession', () => startTenkoSession(startTenkoSessionBody as any), '/api/tenko/sessions/start'],
      ['cancelTenkoSession', () => cancelTenkoSession(UUID1, { reason: 'test' }), `/api/tenko/sessions/${UUID1}/cancel`],
      ['interruptTenkoSession', () => interruptTenkoSession(UUID1), `/api/tenko/sessions/${UUID1}/interrupt`],
      ['resumeTenkoSession', () => resumeTenkoSession(UUID1, { reason: 'resumed' } as any), `/api/tenko/sessions/${UUID1}/resume`],
      ['createWebhook', () => createWebhook(createWebhookBody as any), '/api/tenko/webhooks'],
      ['createBaseline', () => createBaseline(createHealthBaselineBody as any), '/api/tenko/health-baselines'],
      ['createFailure', () => createFailure(createEquipmentFailureBody as any), '/api/tenko/equipment-failures'],
      ['createTimecardCard', () => createTimecardCard(createTimecardCardBody as any), '/api/timecard/cards'],
      ['punchTimecard', () => punchTimecard('NFC-TEST-001'), '/api/timecard/punch'],
      ['createDeviceRegistrationRequest', () => createDeviceRegistrationRequest(), '/api/devices/register/request'],
      ['claimDeviceRegistration', () => claimDeviceRegistration({ code: 'TEST-CODE', device_name: 'Test' } as any), '/api/devices/register/claim'],
      ['createDeviceUrlToken', () => createDeviceUrlToken(), '/api/devices/register/create-token'],
      ['createPermanentQr', () => createPermanentQr(), '/api/devices/register/create-permanent-qr'],
      ['createDeviceOwnerToken', () => createDeviceOwnerToken(), '/api/devices/register/create-device-owner-token'],
      ['approveDevice', () => approveDevice(UUID7), `/api/devices/approve/${UUID7}`],
      ['approveDeviceByCode', () => approveDeviceByCode('TEST-CODE'), '/api/devices/approve-by-code/TEST-CODE'],
      ['rejectDevice', () => rejectDevice(UUID7), `/api/devices/reject/${UUID7}`],
      ['disableDevice', () => disableDevice(UUID7), `/api/devices/disable/${UUID7}`],
      ['enableDevice', () => enableDevice(UUID7), `/api/devices/enable/${UUID7}`],
      ['testFcmNotification', () => testFcmNotification(UUID7), `/api/devices/${UUID7}/test-fcm`],
      ['testFcmAll', () => testFcmAll(), '/api/devices/test-fcm-all'],
      ['triggerUpdate', () => triggerUpdate(), '/api/devices/trigger-update'],
      ['createCarryingItem', () => createCarryingItem(createCarryingItemBody as any), '/api/carrying-items'],
      ['createGuidanceRecord', () => createGuidanceRecord(createGuidanceRecordBody as any), '/api/guidance-records'],
      ['createCommunicationItem', () => createCommunicationItem(createCommunicationItemBody as any), '/api/communication-items'],
    ] as [string, () => Promise<unknown>, string][])(
      '%s → POST %s',
      async (_name, fn, expectedPath) => {
        stubOk({})
        await fn()
        assertMock(() => {
          expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com${expectedPath}`)
          expect(mockFetch.mock.calls[0][1].method).toBe('POST')
        })
      },
    )

    it('punchTimecard with deviceId', async () => {
      stubOk({})
      await punchTimecard('NFC-TEST-001', UUID7)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.card_id).toBe('NFC-TEST-001')
        expect(body.device_id).toBe(UUID7)
      })
    })

    it('punchTimecard with null deviceId omits device_id', async () => {
      stubOk({})
      await punchTimecard('NFC-TEST-001', null)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.device_id).toBeUndefined()
      })
    })

    it('createDeviceRegistrationRequest with deviceName', async () => {
      stubOk({})
      await createDeviceRegistrationRequest('My Device')
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.device_name).toBe('My Device')
      })
    })

    it('createDeviceUrlToken with opts', async () => {
      stubOk({})
      await createDeviceUrlToken('dev', { is_device_owner: true, is_dev_device: true })
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.device_name).toBe('dev')
        expect(body.is_device_owner).toBe(true)
        expect(body.is_dev_device).toBe(true)
      })
    })

    it('createPermanentQr with opts', async () => {
      stubOk({})
      await createPermanentQr('dev', { is_device_owner: true })
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.device_name).toBe('dev')
        expect(body.is_device_owner).toBe(true)
      })
    })

    it('createDeviceOwnerToken with opts', async () => {
      stubOk({})
      await createDeviceOwnerToken('dev', { is_dev_device: true })
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.device_name).toBe('dev')
        expect(body.is_dev_device).toBe(true)
      })
    })

    it('approveDevice with deviceName', async () => {
      stubOk({})
      await approveDevice(UUID7, 'Named Device')
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.device_name).toBe('Named Device')
      })
    })

    it('triggerUpdate with opts', async () => {
      stubOk({})
      await triggerUpdate({ device_ids: [UUID7, UUID8], dev_only: true })
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.device_ids).toEqual([UUID7, UUID8])
        expect(body.dev_only).toBe(true)
      })
    })

    it('batchCreateSchedules sends schedules array in body', async () => {
      stubOk([])
      const schedules = [createScheduleBody] as any
      await batchCreateSchedules(schedules)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.schedules).toEqual(schedules)
      })
    })
  })

  // ============================================================
  // PUT functions (it.each)
  // ============================================================

  describe.skipIf(isLive)('PUT functions', () => {
    it.each([
      ['updateMeasurement', () => updateMeasurement(UUID1, { alcohol_value: 0.1 }), `/api/measurements/${UUID1}`],
      ['updateEmployee', () => updateEmployee(TEST_EMPLOYEE_ID, { name: 'B' }), `/api/employees/${TEST_EMPLOYEE_ID}`],
      ['updateEmployeeFace', () => updateEmployeeFace(TEST_EMPLOYEE_ID, 'url', [1, 2], 'v1'), `/api/employees/${TEST_EMPLOYEE_ID}/face`],
      ['approveFace', () => approveFace(TEST_EMPLOYEE_ID), `/api/employees/${TEST_EMPLOYEE_ID}/face/approve`],
      ['rejectFace', () => rejectFace(TEST_EMPLOYEE_ID), `/api/employees/${TEST_EMPLOYEE_ID}/face/reject`],
      ['updateEmployeeNfcId', () => updateEmployeeNfcId(TEST_EMPLOYEE_ID, 'nfc1'), `/api/employees/${TEST_EMPLOYEE_ID}/nfc`],
      ['updateEmployeeLicense', () => updateEmployeeLicense(TEST_EMPLOYEE_ID, '2026-01-01', '2028-01-01'), `/api/employees/${TEST_EMPLOYEE_ID}/license`],
      ['updateSchedule', () => updateSchedule(UUID2, createScheduleBody as any), `/api/tenko/schedules/${UUID2}`],
      ['submitAlcohol', () => submitAlcohol(UUID3, { alcohol_value: 0.0, device_use_count: 100 } as any), `/api/tenko/sessions/${UUID3}/alcohol`],
      ['submitMedical', () => submitMedical(UUID3, { temperature: 36.5, systolic: 120, diastolic: 80, pulse: 72 } as any), `/api/tenko/sessions/${UUID3}/medical`],
      ['submitSelfDeclaration', () => submitSelfDeclaration(UUID3, { illness: false, fatigue: false, sleep_deprivation: false } as any), `/api/tenko/sessions/${UUID3}/self-declaration`],
      ['submitDailyInspection', () => submitDailyInspection(UUID3, { items: [] } as any), `/api/tenko/sessions/${UUID3}/daily-inspection`],
      ['confirmInstruction', () => confirmInstruction(UUID3), `/api/tenko/sessions/${UUID3}/instruction-confirm`],
      ['submitReport', () => submitReport(UUID3, { report: 'ok' } as any), `/api/tenko/sessions/${UUID3}/report`],
      ['updateBaseline', () => updateBaseline(TEST_EMPLOYEE_ID, createHealthBaselineBody as any), `/api/tenko/health-baselines/${TEST_EMPLOYEE_ID}`],
      ['resolveFailure', () => resolveFailure(UUID6, { resolution: 'fixed' } as any), `/api/tenko/equipment-failures/${UUID6}`],
      ['submitCarryingItemChecks', () => submitCarryingItemChecks(UUID3, []), `/api/tenko/sessions/${UUID3}/carrying-items`],
      ['updateCarryingItem', () => updateCarryingItem(UUID8, createCarryingItemBody as any), `/api/carrying-items/${UUID8}`],
      ['updateCommunicationItem', () => updateCommunicationItem(UUID9, { title: 'Updated' }), `/api/communication-items/${UUID9}`],
      ['updateDeviceCallSettings', () => updateDeviceCallSettings(UUID7, true), `/api/devices/${UUID7}/call-settings`],
      ['updateDeviceLastLogin', () => updateDeviceLastLogin(UUID7, TEST_EMPLOYEE_ID, 'name', []), '/api/devices/update-last-login'],
    ] as [string, () => Promise<unknown>, string][])(
      '%s → PUT %s',
      async (_name, fn, expectedPath) => {
        stubOk({})
        await fn()
        assertMock(() => {
          expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com${expectedPath}`)
          expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
        })
      },
    )

    it('updateEmployeeFace sends correct body with null defaults', async () => {
      stubOk({})
      await updateEmployeeFace(TEST_EMPLOYEE_ID)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.face_photo_url).toBeNull()
        expect(body.face_embedding).toBeNull()
        expect(body.face_model_version).toBeNull()
      })
    })

    it('updateEmployeeNfcId sends correct body', async () => {
      stubOk({})
      await updateEmployeeNfcId(TEST_EMPLOYEE_ID, 'NFC123')
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.nfc_id).toBe('NFC123')
      })
    })

    it('updateEmployeeLicense sends null defaults', async () => {
      stubOk({})
      await updateEmployeeLicense(TEST_EMPLOYEE_ID)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.license_issue_date).toBeNull()
        expect(body.license_expiry_date).toBeNull()
      })
    })

    it('updateDeviceCallSettings with callSchedule and alwaysOn', async () => {
      stubOk({})
      const schedule = { start: '08:00', end: '18:00' }
      await updateDeviceCallSettings(UUID7, true, schedule as any, true)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.call_enabled).toBe(true)
        expect(body.call_schedule).toEqual(schedule)
        expect(body.always_on).toBe(true)
      })
    })

    it('updateDeviceCallSettings without alwaysOn omits always_on', async () => {
      stubOk({})
      await updateDeviceCallSettings(UUID7, false, null)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.call_enabled).toBe(false)
        expect(body.call_schedule).toBeNull()
        expect(body).not.toHaveProperty('always_on')
      })
    })

    it('updateDeviceLastLogin sends correct body', async () => {
      stubOk({})
      await updateDeviceLastLogin(UUID7, TEST_EMPLOYEE_ID, 'Taro', ['admin'])
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.device_id).toBe(UUID7)
        expect(body.employee_id).toBe(TEST_EMPLOYEE_ID)
        expect(body.employee_name).toBe('Taro')
        expect(body.employee_role).toEqual(['admin'])
      })
    })

    it('submitCarryingItemChecks sends checks in body', async () => {
      stubOk({})
      const checks = [{ item_id: UUID8, checked: true }]
      await submitCarryingItemChecks(UUID3, checks as any)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.checks).toEqual(checks)
      })
    })

    it('confirmInstruction sends empty body', async () => {
      stubOk({})
      await confirmInstruction(UUID3)
      assertMock(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body).toEqual({})
      })
    })
  })

  // ============================================================
  // DELETE functions (it.each)
  // ============================================================

  describe.skipIf(isLive)('DELETE functions', () => {
    it.each([
      ['deleteEmployee', () => deleteEmployee(TEST_EMPLOYEE_ID), `/api/employees/${TEST_EMPLOYEE_ID}`],
      ['deleteSchedule', () => deleteSchedule(UUID2), `/api/tenko/schedules/${UUID2}`],
      ['deleteWebhook', () => deleteWebhook(UUID5), `/api/tenko/webhooks/${UUID5}`],
      ['deleteBaseline', () => deleteBaseline(TEST_EMPLOYEE_ID), `/api/tenko/health-baselines/${TEST_EMPLOYEE_ID}`],
      ['deleteTimecardCard', () => deleteTimecardCard(UUID10), `/api/timecard/cards/${UUID10}`],
      ['deleteDevice', () => deleteDevice(UUID7), `/api/devices/${UUID7}`],
      ['deleteCarryingItem', () => deleteCarryingItem(UUID8), `/api/carrying-items/${UUID8}`],
      ['deleteGuidanceRecord', () => deleteGuidanceRecord(UUID9), `/api/guidance-records/${UUID9}`],
      ['deleteGuidanceAttachment', () => deleteGuidanceAttachment(UUID9, UUID10), `/api/guidance-records/${UUID9}/attachments/${UUID10}`],
      ['deleteCommunicationItem', () => deleteCommunicationItem(UUID9), `/api/communication-items/${UUID9}`],
    ] as [string, () => Promise<unknown>, string][])(
      '%s → DELETE %s',
      async (_name, fn, expectedPath) => {
        stub204()
        await fn()
        assertMock(() => {
          expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com${expectedPath}`)
          expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
        })
      },
    )
  })

  // ============================================================
  // FormData upload functions
  // ============================================================

  describe('uploadFacePhoto', () => {
    it.skipIf(isLive)('should upload and return URL', async () => {
      stubResponse({
        ok: true,
        json: () => Promise.resolve({ url: 'https://r2.example.com/face.jpg' }),
      })

      const blob = new Blob(['photo'], { type: 'image/jpeg' })
      const url = await uploadFacePhoto(blob)
      expect(url).toBe('https://r2.example.com/face.jpg')

      assertMock(() => {
        const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0]
        expect(fetchUrl).toBe('https://api.example.com/api/upload/face-photo')
        expect(fetchOpts.method).toBe('POST')
        expect(fetchOpts.body).toBeInstanceOf(FormData)
      })
    })

    it.skipIf(isLive)('should throw on upload error', async () => {
      stubResponse({ ok: false, status: 413 })
      const blob = new Blob(['photo'])
      await expect(uploadFacePhoto(blob)).rejects.toThrow('アップロード失敗 (413)')
    })

    it.skipIf(isLive)('should throw if API not initialized', async () => {
      initApi('')
      const blob = new Blob(['photo'])
      await expect(uploadFacePhoto(blob)).rejects.toThrow('API 未初期化')
    })
  })

  describe('uploadReportAudio', () => {
    it.skipIf(isLive)('should upload and return URL', async () => {
      stubResponse({
        ok: true,
        json: () => Promise.resolve({ url: 'https://r2.example.com/report.webm' }),
      })

      const blob = new Blob(['audio'], { type: 'audio/webm' })
      const url = await uploadReportAudio(blob)
      expect(url).toBe('https://r2.example.com/report.webm')

      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/upload/report-audio') })
    })

    it.skipIf(isLive)('should throw on upload error', async () => {
      stubResponse({ ok: false, status: 500 })
      const blob = new Blob(['audio'])
      await expect(uploadReportAudio(blob)).rejects.toThrow('音声アップロード失敗 (500)')
    })

    it.skipIf(isLive)('should throw if API not initialized', async () => {
      initApi('')
      const blob = new Blob(['audio'])
      await expect(uploadReportAudio(blob)).rejects.toThrow('API 未初期化')
    })
  })

  describe('uploadBlowVideo', () => {
    it.skipIf(isLive)('should upload and return URL', async () => {
      stubResponse({
        ok: true,
        json: () => Promise.resolve({ url: 'https://r2.example.com/blow.webm' }),
      })

      const blob = new Blob(['video'], { type: 'video/webm' })
      const url = await uploadBlowVideo(blob)
      expect(url).toBe('https://r2.example.com/blow.webm')

      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/upload/blow-video') })
    })

    it.skipIf(isLive)('should throw on upload error', async () => {
      stubResponse({ ok: false, status: 500 })
      const blob = new Blob(['video'])
      await expect(uploadBlowVideo(blob)).rejects.toThrow('録画アップロード失敗 (500)')
    })

    it.skipIf(isLive)('should throw if API not initialized', async () => {
      initApi('')
      const blob = new Blob(['video'])
      await expect(uploadBlowVideo(blob)).rejects.toThrow('API 未初期化')
    })
  })

  describe('uploadGuidanceAttachment', () => {
    it.skipIf(isLive)('should upload and return attachment data', async () => {
      const attachmentData = { id: 'att1', filename: 'doc.pdf' }
      stubResponse({
        ok: true,
        json: () => Promise.resolve(attachmentData),
      })

      const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
      const result = await uploadGuidanceAttachment(UUID9, file)
      expect(result).toEqual(attachmentData)

      assertMock(() => {
        const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0]
        expect(fetchUrl).toBe(`https://api.example.com/api/guidance-records/${UUID9}/attachments`)
        expect(fetchOpts.method).toBe('POST')
        expect(fetchOpts.body).toBeInstanceOf(FormData)
      })
    })

    it.skipIf(isLive)('should throw on upload error', async () => {
      stubResponse({ ok: false, status: 400 })
      const file = new File(['content'], 'doc.pdf')
      await expect(uploadGuidanceAttachment(UUID9, file)).rejects.toThrow('Upload failed: 400')
    })

    it.skipIf(isLive)('should throw if API not initialized', async () => {
      initApi('')
      const file = new File(['content'], 'doc.pdf')
      await expect(uploadGuidanceAttachment(UUID9, file)).rejects.toThrow('API 未初期化')
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

    it.skipIf(isLive)('should return object URL on success', async () => {
      stubResponse({
        ok: true,
        blob: () => Promise.resolve(new Blob(['photo'])),
      })

      const result = await fetchFacePhoto(UUID1)
      expect(result).toBe('blob:http://localhost/abc')
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe(`https://api.example.com/api/measurements/${UUID1}/face-photo`) })
    })

    it.skipIf(isLive)('should return null when response is not ok', async () => {
      stubResponse({ ok: false, status: 404 })
      const result = await fetchFacePhoto(UUID1)
      expect(result).toBeNull()
    })

    it.skipIf(isLive)('should return null when fetch throws', async () => {
      stubReject(new Error('network error'))
      const result = await fetchFacePhoto(UUID1)
      expect(result).toBeNull()
    })

    it.skipIf(isLive)('should return null when apiBase is empty', async () => {
      initApi('')
      const result = await fetchFacePhoto(UUID1)
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

    it.skipIf(isLive)('downloadTenkoRecordsCsv should download CSV', async () => {
      stubResponse({
        ok: true,
        blob: () => Promise.resolve(new Blob(['csv'])),
      })

      await downloadTenkoRecordsCsv({})

      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/tenko/records/csv') })
      expect(mockAnchor.download).toBe('tenko-records.csv')
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/csv')
    })

    it.skipIf(isLive)('downloadFailuresCsv should download CSV', async () => {
      stubResponse({
        ok: true,
        blob: () => Promise.resolve(new Blob(['csv'])),
      })

      await downloadFailuresCsv({})

      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/tenko/equipment-failures/csv') })
      expect(mockAnchor.download).toBe('equipment-failures.csv')
    })

    it.skipIf(isLive)('downloadTimePunchesCsv should download CSV', async () => {
      stubResponse({
        ok: true,
        blob: () => Promise.resolve(new Blob(['csv'])),
      })

      await downloadTimePunchesCsv({})

      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/api/timecard/punches/csv') })
      expect(mockAnchor.download).toBe('time-punches.csv')
    })

    it.skipIf(isLive)('downloadCsv should throw on error response', async () => {
      stubResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('error body'),
      })

      await expect(downloadTenkoRecordsCsv({})).rejects.toThrow('CSV ダウンロード失敗 (500)')
    })

    it.skipIf(isLive)('downloadCsv should use statusText when text() fails', async () => {
      stubResponse({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: () => Promise.reject(new Error('fail')),
      })

      await expect(downloadTenkoRecordsCsv({})).rejects.toThrow('CSV ダウンロード失敗 (502)')
    })

    it.skipIf(isLive)('downloadCsv should throw if API not initialized', async () => {
      initApi('')
      await expect(downloadTenkoRecordsCsv({})).rejects.toThrow('API 未初期化')
    })

    it.skipIf(isLive)('downloadTenkoRecordsCsv with filter params', async () => {
      stubResponse({
        ok: true,
        blob: () => Promise.resolve(new Blob(['csv'])),
      })

      await downloadTenkoRecordsCsv({ employee_id: TEST_EMPLOYEE_ID } as any)
      assertMock(() => { expect(mockFetch.mock.calls[0][0]).toContain(`employee_id=${TEST_EMPLOYEE_ID}`) })
    })

    it.skipIf(isLive)('downloadCsv should use statusText fallback when body is empty', async () => {
      stubResponse({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(''),
      })

      await expect(downloadTenkoRecordsCsv({})).rejects.toThrow('Forbidden')
    })
  })

  // ============================================================
  // CRUD テスト (mock / live 両対応)
  // ============================================================

  describe('Employees CRUD', () => {
    let createdId: string

    it('should list employees', async () => {
      stubOk([{ id: TEST_EMPLOYEE_ID, name: 'Test Driver' }])
      const employees = await getEmployees()
      expect(Array.isArray(employees)).toBe(true)
      expect(employees.length).toBeGreaterThanOrEqual(1)
    })

    it('should get employee by id', async () => {
      stubOk({ id: TEST_EMPLOYEE_ID, name: 'Test Driver' })
      const emp = await getEmployeeById(TEST_EMPLOYEE_ID)
      expect(emp.id).toBe(TEST_EMPLOYEE_ID)
    })

    it('should create employee', async () => {
      stubOk({ id: UUID1, ...createEmployeeBody })
      const emp = await createEmployee(createEmployeeBody)
      expect(emp.id).toBeDefined()
      expect(emp.name).toBe('New Driver')
      createdId = emp.id
    })

    it('should update employee', async () => {
      stubOk({ id: createdId, name: 'Updated Driver' })
      const emp = await updateEmployee(createdId, { name: 'Updated Driver' })
      expect(emp.name).toBe('Updated Driver')
    })

    it('should delete employee', async () => {
      stub204()
      await deleteEmployee(createdId)
    })
  })

  describe('Measurements CRUD', () => {
    let measurementId: string

    it('should start measurement', async () => {
      stubOk({ id: UUID1, employee_id: TEST_EMPLOYEE_ID, status: 'started' })
      const m = await startMeasurement(TEST_EMPLOYEE_ID)
      expect(m.id).toBeDefined()
      expect(m.employee_id).toBe(TEST_EMPLOYEE_ID)
      measurementId = m.id
    })

    it('should update measurement', async () => {
      stubOk({ id: measurementId, alcohol_value: 0.0, result_type: 'normal' })
      const m = await updateMeasurement(measurementId, {
        alcohol_value: 0.0,
        result_type: 'normal',
      })
      expect(m.id).toBe(measurementId)
    })

    it('should get measurement by id', async () => {
      stubOk({ id: measurementId })
      const m = await getMeasurement(measurementId)
      expect(m.id).toBe(measurementId)
    })

    it('should list measurements', async () => {
      stubOk({ measurements: [], total: 0, page: 1, per_page: 20 })
      const result = await getMeasurements()
      expect(result.measurements).toBeDefined()
      expect(Array.isArray(result.measurements)).toBe(true)
    })

    it('should save measurement (full flow)', async () => {
      stubOk({ id: UUID2, employee_id: TEST_EMPLOYEE_ID })
      const result: MeasurementResult = {
        employeeId: TEST_EMPLOYEE_ID,
        alcoholValue: 0.0,
        resultType: 'normal',
        deviceUseCount: 100,
        measuredAt: new Date(),
      }
      const m = await saveMeasurement(result)
      expect(m.id).toBeDefined()
    })
  })

  describe('Tenko Schedules CRUD', () => {
    let scheduleId: string

    it('should create schedule', async () => {
      stubOk({ id: UUID1, ...createScheduleBody })
      const s = await createSchedule(createScheduleBody as any)
      expect(s.id).toBeDefined()
      scheduleId = s.id
    })

    it('should list schedules', async () => {
      stubOk({ schedules: [{ id: scheduleId }], total: 1 })
      const result = await listSchedules()
      expect(result.schedules).toBeDefined()
      expect(result.schedules.length).toBeGreaterThanOrEqual(1)
    })

    it('should get schedule by id', async () => {
      stubOk({ id: scheduleId })
      const s = await getSchedule(scheduleId)
      expect(s.id).toBe(scheduleId)
    })

    it('should update schedule', async () => {
      stubOk({ id: scheduleId, responsible_manager_name: 'Updated Manager' })
      const s = await updateSchedule(scheduleId, { responsible_manager_name: 'Updated Manager' })
      expect(s.responsible_manager_name).toBe('Updated Manager')
    })

    it('should delete schedule', async () => {
      stub204()
      await deleteSchedule(scheduleId)
    })
  })

  describe('Tenko Sessions CRUD', () => {
    let sessionId: string
    let scheduleId: string

    it('should start session', async () => {
      stubOk({ id: UUID3, ...createScheduleBody })
      const s = await createSchedule(createScheduleBody as any)
      scheduleId = s.id

      stubOk({ id: UUID4, employee_id: TEST_EMPLOYEE_ID, status: 'identity' })
      const session = await startTenkoSession({
        employee_id: TEST_EMPLOYEE_ID,
        schedule_id: scheduleId,
        tenko_type: 'pre_operation',
      } as any)
      expect(session.id).toBeDefined()
      sessionId = session.id
    })

    it('should get session', async () => {
      stubOk({ id: sessionId })
      const session = await getTenkoSession(sessionId)
      expect(session.id).toBe(sessionId)
    })

    it('should cancel session', async () => {
      stubOk({ id: sessionId, status: 'cancelled' })
      const session = await cancelTenkoSession(sessionId, { reason: 'test cancel' })
      expect(session.status).toBe('cancelled')
    })

    it('should list sessions', async () => {
      stubOk({ sessions: [], total: 0 })
      const result = await listTenkoSessions()
      expect(result.sessions).toBeDefined()
    })

    it('should get dashboard', async () => {
      stubOk({ total: 0 })
      const dashboard = await getTenkoDashboard()
      expect(dashboard).toBeDefined()
    })
  })

  describe('Health Baselines CRUD', () => {
    it('should create baseline', async () => {
      stubOk({ employee_id: TEST_EMPLOYEE_ID, ...createHealthBaselineBody })
      const b = await createBaseline(createHealthBaselineBody as any)
      expect(b.employee_id).toBe(TEST_EMPLOYEE_ID)
    })

    it('should list baselines', async () => {
      stubOk([])
      const baselines = await listBaselines()
      expect(Array.isArray(baselines)).toBe(true)
    })

    it('should get baseline', async () => {
      stubOk({ employee_id: TEST_EMPLOYEE_ID })
      const b = await getBaseline(TEST_EMPLOYEE_ID)
      expect(b.employee_id).toBe(TEST_EMPLOYEE_ID)
    })

    it('should update baseline', async () => {
      stubOk({ employee_id: TEST_EMPLOYEE_ID, baseline_systolic: 130 })
      const b = await updateBaseline(TEST_EMPLOYEE_ID, { baseline_systolic: 130 } as any)
      expect(b.baseline_systolic).toBe(130)
    })

    it('should delete baseline', async () => {
      stub204()
      await deleteBaseline(TEST_EMPLOYEE_ID)
    })
  })

  describe('Equipment Failures CRUD', () => {
    let failureId: string

    it('should create failure', async () => {
      stubOk({ id: UUID1, ...createEquipmentFailureBody })
      const f = await createFailure(createEquipmentFailureBody as any)
      expect(f.id).toBeDefined()
      failureId = f.id
    })

    it('should list failures', async () => {
      stubOk({ failures: [], total: 0 })
      const result = await listFailures()
      expect(result.failures).toBeDefined()
    })

    it('should get failure', async () => {
      stubOk({ id: failureId })
      const f = await getFailure(failureId)
      expect(f.id).toBe(failureId)
    })

    it('should resolve failure', async () => {
      stubOk({ id: failureId, resolved_at: '2026-01-01' })
      const f = await resolveFailure(failureId, { resolution: 'Replaced device' } as any)
      expect(f.resolved_at).toBeDefined()
    })
  })

  describe('Timecard CRUD', () => {
    let cardId: string
    const nfcCardId = 'NFC-TEST-CARD-001'

    it('should create timecard card', async () => {
      stubOk({ id: UUID1, card_id: nfcCardId, employee_id: TEST_EMPLOYEE_ID })
      const card = await createTimecardCard(createTimecardCardBody as any)
      expect(card.id).toBeDefined()
      cardId = card.id
    })

    it('should list timecard cards', async () => {
      stubOk([{ id: cardId }])
      const cards = await listTimecardCards()
      expect(Array.isArray(cards)).toBe(true)
      expect(cards.length).toBeGreaterThanOrEqual(1)
    })

    it('should punch timecard', async () => {
      stubOk({ employee_name: 'Test Driver' })
      const punch = await punchTimecard(nfcCardId)
      expect(punch.employee_name).toBeDefined()
    })

    it('should list time punches', async () => {
      stubOk({ punches: [], total: 0 })
      const result = await listTimePunches()
      expect(result.punches).toBeDefined()
    })

    it('should delete timecard card', async () => {
      stub204()
      await deleteTimecardCard(cardId)
    })
  })

  describe('Devices CRUD', () => {
    it('should create device registration request', async () => {
      stubOk({ registration_code: '123456', expires_at: '2026-01-01' })
      const result = await createDeviceRegistrationRequest('Test Device')
      expect(result.registration_code).toBeDefined()
    })

    it('should check registration status', async () => {
      stubOk({ registration_code: 'CODE1', expires_at: '2026-01-01' })
      const reg = await createDeviceRegistrationRequest('Status Check')
      stubOk({ status: 'pending' })
      const status = await checkDeviceRegistrationStatus(reg.registration_code)
      expect(status.status).toBeDefined()
    })

    it('should list devices', async () => {
      stubOk([])
      const devices = await listDevices()
      expect(Array.isArray(devices)).toBe(true)
    })

    it('should list pending registrations', async () => {
      stubOk([])
      const pending = await listPendingDeviceRegistrations()
      expect(Array.isArray(pending)).toBe(true)
    })
  })

  describe('Webhooks CRUD', () => {
    let webhookId: string

    it('should create webhook', async () => {
      stubOk({ id: UUID1, ...createWebhookBody })
      const w = await createWebhook(createWebhookBody as any)
      expect(w.id).toBeDefined()
      webhookId = w.id
    })

    it('should list webhooks', async () => {
      stubOk([{ id: webhookId }])
      const webhooks = await listWebhooks()
      expect(Array.isArray(webhooks)).toBe(true)
      expect(webhooks.length).toBeGreaterThanOrEqual(1)
    })

    it('should delete webhook', async () => {
      stub204()
      await deleteWebhook(webhookId)
    })
  })

  describe('Carrying Items CRUD', () => {
    let itemId: string

    it('should create carrying item', async () => {
      stubOk({ id: UUID1, ...createCarryingItemBody })
      const item = await createCarryingItem(createCarryingItemBody as any)
      expect(item.id).toBeDefined()
      itemId = item.id
    })

    it('should list carrying items', async () => {
      stubOk([])
      const items = await getCarryingItems()
      expect(Array.isArray(items)).toBe(true)
    })

    it('should update carrying item', async () => {
      stubOk({ id: itemId, item_name: 'Updated Item' })
      const item = await updateCarryingItem(itemId, { item_name: 'Updated Item' } as any)
      expect(item.item_name).toBe('Updated Item')
    })

    it('should delete carrying item', async () => {
      stub204()
      await deleteCarryingItem(itemId)
    })
  })

  describe('Communication Items CRUD', () => {
    let itemId: string

    it('should create communication item', async () => {
      stubOk({ id: UUID1, ...createCommunicationItemBody })
      const item = await createCommunicationItem(createCommunicationItemBody as any)
      expect(item.id).toBeDefined()
      itemId = item.id
    })

    it('should list communication items', async () => {
      stubOk({ items: [], total: 0 })
      const result = await listCommunicationItems()
      expect(result.items).toBeDefined()
    })

    it('should update communication item', async () => {
      stubOk({ id: itemId, title: 'Updated Notice' })
      const item = await updateCommunicationItem(itemId, { title: 'Updated Notice' })
      expect(item.title).toBe('Updated Notice')
    })

    it('should delete communication item', async () => {
      stub204()
      await deleteCommunicationItem(itemId)
    })
  })

  describe('Guidance Records CRUD', () => {
    let recordId: string

    it('should create guidance record', async () => {
      stubOk({ id: UUID1, ...createGuidanceRecordBody })
      const r = await createGuidanceRecord(createGuidanceRecordBody as any)
      expect(r.id).toBeDefined()
      recordId = r.id
    })

    it('should list guidance records', async () => {
      stubOk({ records: [], total: 0 })
      const result = await listGuidanceRecords()
      expect(result.records).toBeDefined()
    })

    it('should delete guidance record', async () => {
      stub204()
      await deleteGuidanceRecord(recordId)
    })
  })

  describe('Tenko Records', () => {
    it('should list tenko records', async () => {
      stubOk({ records: [], total: 0 })
      const result = await listTenkoRecords()
      expect(result.records).toBeDefined()
    })
  })

  describe('Misc endpoints', () => {
    it('should get daily health status', async () => {
      stubOk({})
      const result = await getDailyHealthStatus()
      expect(result).toBeDefined()
    })

    it('should get vehicle categories', async () => {
      stubOk({})
      const result = await getVehicleCategories()
      expect(result).toBeDefined()
    })
  })

  describe.skipIf(!isLive)('Auth (live only)', () => {
    it('should reject request without auth', async () => {
      initApi(API_BASE)
      await expect(getEmployees()).rejects.toThrow()
    })

    it('should reject request with invalid JWT', async () => {
      initApi(API_BASE, () => 'invalid-token')
      await expect(getEmployees()).rejects.toThrow()
    })
  })
})
