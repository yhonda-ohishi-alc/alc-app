import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'node:crypto'
import { initApi } from '~/utils/api'
import {
  // Employees
  getEmployees, getEmployeeById, createEmployee, updateEmployee, deleteEmployee,
  getEmployeeByCode,
  // Measurements
  saveMeasurement, getMeasurements, getMeasurement, startMeasurement, updateMeasurement,
  // Tenko schedules
  createSchedule, listSchedules, getSchedule, updateSchedule, deleteSchedule,
  // Tenko sessions
  startTenkoSession, getTenkoSession,
  cancelTenkoSession, listTenkoSessions, getTenkoDashboard,
  // Health baselines
  createBaseline, listBaselines, getBaseline, updateBaseline, deleteBaseline,
  // Equipment failures
  createFailure, listFailures, getFailure, resolveFailure,
  // Timecard
  createTimecardCard, listTimecardCards, deleteTimecardCard, punchTimecard, listTimePunches,
  // Devices
  createDeviceRegistrationRequest, checkDeviceRegistrationStatus,
  listDevices, listPendingDeviceRegistrations,
  // Webhooks
  createWebhook, listWebhooks, deleteWebhook,
  // Carrying items
  getCarryingItems, createCarryingItem, updateCarryingItem, deleteCarryingItem,
  // Communication items
  listCommunicationItems, createCommunicationItem, updateCommunicationItem, deleteCommunicationItem,
  // Guidance records
  listGuidanceRecords, createGuidanceRecord, deleteGuidanceRecord,
  // Tenko records
  listTenkoRecords,
  // Daily health
  getDailyHealthStatus,
  // Vehicle categories
  getVehicleCategories,
} from '~/utils/api'
import type { MeasurementResult } from '~/types'

// ---------------------------------------------------------------------------
// JWT helper (HS256, no external deps)
// ---------------------------------------------------------------------------
const API_BASE = process.env.API_BASE_URL || 'http://localhost:18080'
const JWT_SECRET = 'test-jwt-secret-for-integration'
const TENANT_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const EMPLOYEE_ID = '33333333-3333-3333-3333-333333333333'

function makeJwt(overrides: Record<string, unknown> = {}): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: USER_ID,
    email: 'test@example.com',
    name: 'Test Admin',
    tenant_id: TENANT_ID,
    role: 'admin',
    iat: now,
    exp: now + 3600,
    ...overrides,
  }
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${b64(header)}.${b64(payload)}`
  const sig = createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url')
  return `${unsigned}.${sig}`
}

// ---------------------------------------------------------------------------
// Wait for API to be ready
// ---------------------------------------------------------------------------
async function waitForApi(url: string, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`API not ready after ${maxRetries} retries`)
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const jwtToken = makeJwt()

describe('API Live Integration Tests', () => {
  beforeAll(async () => {
    await waitForApi(API_BASE)
    initApi(API_BASE, () => jwtToken)
  })

  // ========================================================================
  // Employees CRUD
  // ========================================================================
  describe('Employees', () => {
    let createdId: string

    it('should list employees (includes seed data)', async () => {
      const employees = await getEmployees()
      expect(Array.isArray(employees)).toBe(true)
      // seed has one employee
      expect(employees.length).toBeGreaterThanOrEqual(1)
    })

    it('should get employee by id', async () => {
      const emp = await getEmployeeById(EMPLOYEE_ID)
      expect(emp.id).toBe(EMPLOYEE_ID)
      expect(emp.name).toBe('Test Driver')
    })

    it('should get employee by code', async () => {
      const emp = await getEmployeeByCode('E001')
      expect(emp.id).toBe(EMPLOYEE_ID)
    })

    it('should create employee', async () => {
      const emp = await createEmployee({ name: 'New Driver', code: 'E999' })
      expect(emp.id).toBeDefined()
      expect(emp.name).toBe('New Driver')
      createdId = emp.id
    })

    it('should update employee', async () => {
      const emp = await updateEmployee(createdId, { name: 'Updated Driver' })
      expect(emp.name).toBe('Updated Driver')
    })

    it('should delete employee', async () => {
      await deleteEmployee(createdId)
      // soft delete — should still be fetchable but marked deleted
    })
  })

  // ========================================================================
  // Measurements
  // ========================================================================
  describe('Measurements', () => {
    let measurementId: string

    it('should start measurement', async () => {
      const m = await startMeasurement(EMPLOYEE_ID)
      expect(m.id).toBeDefined()
      expect(m.employee_id).toBe(EMPLOYEE_ID)
      measurementId = m.id
    })

    it('should update measurement', async () => {
      const m = await updateMeasurement(measurementId, {
        alcohol_value: 0.0,
        result_type: 'normal',
      })
      expect(m.id).toBe(measurementId)
    })

    it('should get measurement by id', async () => {
      const m = await getMeasurement(measurementId)
      expect(m.id).toBe(measurementId)
    })

    it('should list measurements', async () => {
      const result = await getMeasurements()
      expect(result.measurements).toBeDefined()
      expect(Array.isArray(result.measurements)).toBe(true)
    })

    it('should save measurement (full flow)', async () => {
      const result: MeasurementResult = {
        employeeId: EMPLOYEE_ID,
        alcoholValue: 0.0,
        resultType: 'normal',
        deviceUseCount: 100,
        measuredAt: new Date(),
      }
      const m = await saveMeasurement(result)
      expect(m.id).toBeDefined()
    })
  })

  // ========================================================================
  // Tenko Schedules
  // ========================================================================
  describe('Tenko Schedules', () => {
    let scheduleId: string

    it('should create schedule', async () => {
      const s = await createSchedule({
        employee_id: EMPLOYEE_ID,
        tenko_type: 'pre_operation',
        responsible_manager_name: 'Test Manager',
        scheduled_at: new Date().toISOString(),
        instruction: 'Test instruction',
      })
      expect(s.id).toBeDefined()
      scheduleId = s.id
    })

    it('should list schedules', async () => {
      const result = await listSchedules()
      expect(result.schedules).toBeDefined()
      expect(result.schedules.length).toBeGreaterThanOrEqual(1)
    })

    it('should get schedule by id', async () => {
      const s = await getSchedule(scheduleId)
      expect(s.id).toBe(scheduleId)
    })

    it('should update schedule', async () => {
      const s = await updateSchedule(scheduleId, { responsible_manager_name: 'Updated Manager' })
      expect(s.responsible_manager_name).toBe('Updated Manager')
    })

    it('should delete schedule', async () => {
      await deleteSchedule(scheduleId)
    })
  })

  // ========================================================================
  // Tenko Sessions (basic flow)
  // ========================================================================
  describe('Tenko Sessions', () => {
    let sessionId: string
    let scheduleId: string

    beforeAll(async () => {
      // Create a schedule for the session
      const s = await createSchedule({
        employee_id: EMPLOYEE_ID,
        tenko_type: 'pre_operation',
        responsible_manager_name: 'Test Manager',
        scheduled_at: new Date().toISOString(),
        instruction: 'Test instruction',
      })
      scheduleId = s.id
    })

    it('should start session', async () => {
      const session = await startTenkoSession({
        employee_id: EMPLOYEE_ID,
        schedule_id: scheduleId,
        tenko_type: 'pre_operation',
      })
      expect(session.id).toBeDefined()
      sessionId = session.id
    })

    it('should get session', async () => {
      const session = await getTenkoSession(sessionId)
      expect(session.id).toBe(sessionId)
    })

    it('should cancel session', async () => {
      const session = await cancelTenkoSession(sessionId, { reason: 'test cancel' })
      expect(session.status).toBe('cancelled')
    })

    it('should list sessions', async () => {
      const result = await listTenkoSessions()
      expect(result.sessions).toBeDefined()
    })

    it('should get dashboard', async () => {
      const dashboard = await getTenkoDashboard()
      expect(dashboard).toBeDefined()
    })
  })

  // ========================================================================
  // Health Baselines
  // ========================================================================
  describe('Health Baselines', () => {
    it('should create baseline', async () => {
      const b = await createBaseline({
        employee_id: EMPLOYEE_ID,
        baseline_systolic: 120,
        baseline_diastolic: 80,
        baseline_temperature: 36.5,
      })
      expect(b.employee_id).toBe(EMPLOYEE_ID)
    })

    it('should list baselines', async () => {
      const baselines = await listBaselines()
      expect(Array.isArray(baselines)).toBe(true)
    })

    it('should get baseline', async () => {
      const b = await getBaseline(EMPLOYEE_ID)
      expect(b.employee_id).toBe(EMPLOYEE_ID)
    })

    it('should update baseline', async () => {
      const b = await updateBaseline(EMPLOYEE_ID, { baseline_systolic: 130 })
      expect(b.baseline_systolic).toBe(130)
    })

    it('should delete baseline', async () => {
      await deleteBaseline(EMPLOYEE_ID)
    })
  })

  // ========================================================================
  // Equipment Failures
  // ========================================================================
  describe('Equipment Failures', () => {
    let failureId: string

    it('should create failure', async () => {
      const f = await createFailure({
        failure_type: 'manual_report',
        description: 'Test failure',
      })
      expect(f.id).toBeDefined()
      failureId = f.id
    })

    it('should list failures', async () => {
      const result = await listFailures()
      expect(result.failures).toBeDefined()
    })

    it('should get failure', async () => {
      const f = await getFailure(failureId)
      expect(f.id).toBe(failureId)
    })

    it('should resolve failure', async () => {
      const f = await resolveFailure(failureId, {
        resolution: 'Replaced device',
      })
      expect(f.resolved_at).toBeDefined()
    })
  })

  // ========================================================================
  // Timecard
  // ========================================================================
  describe('Timecard', () => {
    let cardId: string
    const nfcCardId = 'NFC-TEST-CARD-001'

    it('should create timecard card', async () => {
      const card = await createTimecardCard({
        card_id: nfcCardId,
        employee_id: EMPLOYEE_ID,
      })
      expect(card.id).toBeDefined()
      cardId = card.id
    })

    it('should list timecard cards', async () => {
      const cards = await listTimecardCards()
      expect(Array.isArray(cards)).toBe(true)
      expect(cards.length).toBeGreaterThanOrEqual(1)
    })

    it('should punch timecard', async () => {
      const punch = await punchTimecard(nfcCardId)
      expect(punch.employee_name).toBeDefined()
    })

    it('should list time punches', async () => {
      const result = await listTimePunches()
      expect(result.punches).toBeDefined()
    })

    it('should delete timecard card', async () => {
      await deleteTimecardCard(cardId)
    })
  })

  // ========================================================================
  // Devices (public endpoints)
  // ========================================================================
  describe('Devices', () => {
    it('should create device registration request', async () => {
      // This is a public endpoint (no auth needed), but initApi sets X-Tenant-ID
      const result = await createDeviceRegistrationRequest('Test Device')
      expect(result.registration_code).toBeDefined()
    })

    it('should check registration status', async () => {
      const reg = await createDeviceRegistrationRequest('Status Check Device')
      const status = await checkDeviceRegistrationStatus(reg.registration_code)
      expect(status.status).toBeDefined()
    })

    it('should list devices', async () => {
      const devices = await listDevices()
      expect(Array.isArray(devices)).toBe(true)
    })

    it('should list pending registrations', async () => {
      const pending = await listPendingDeviceRegistrations()
      expect(Array.isArray(pending)).toBe(true)
    })
  })

  // ========================================================================
  // Webhooks
  // ========================================================================
  describe('Webhooks', () => {
    let webhookId: string

    it('should create webhook', async () => {
      const w = await createWebhook({
        url: 'https://example.com/webhook',
        event_type: 'tenko_completed',
      })
      expect(w.id).toBeDefined()
      webhookId = w.id
    })

    it('should list webhooks', async () => {
      const webhooks = await listWebhooks()
      expect(Array.isArray(webhooks)).toBe(true)
      expect(webhooks.length).toBeGreaterThanOrEqual(1)
    })

    it('should delete webhook', async () => {
      await deleteWebhook(webhookId)
    })
  })

  // ========================================================================
  // Carrying Items
  // ========================================================================
  describe('Carrying Items', () => {
    let itemId: string

    it('should create carrying item', async () => {
      const item = await createCarryingItem({ item_name: 'Test Item' })
      expect(item.id).toBeDefined()
      itemId = item.id
    })

    it('should list carrying items', async () => {
      const items = await getCarryingItems()
      expect(Array.isArray(items)).toBe(true)
    })

    it('should update carrying item', async () => {
      const item = await updateCarryingItem(itemId, { item_name: 'Updated Item' })
      expect(item.item_name).toBe('Updated Item')
    })

    it('should delete carrying item', async () => {
      await deleteCarryingItem(itemId)
    })
  })

  // ========================================================================
  // Communication Items
  // ========================================================================
  describe('Communication Items', () => {
    let itemId: string

    it('should create communication item', async () => {
      const item = await createCommunicationItem({
        title: 'Test Notice',
        body: 'Test content',
      })
      expect(item.id).toBeDefined()
      itemId = item.id
    })

    it('should list communication items', async () => {
      const result = await listCommunicationItems()
      expect(result.items).toBeDefined()
    })

    it('should update communication item', async () => {
      const item = await updateCommunicationItem(itemId, { title: 'Updated Notice' })
      expect(item.title).toBe('Updated Notice')
    })

    it('should delete communication item', async () => {
      await deleteCommunicationItem(itemId)
    })
  })

  // ========================================================================
  // Guidance Records
  // ========================================================================
  describe('Guidance Records', () => {
    let recordId: string

    it('should create guidance record', async () => {
      const r = await createGuidanceRecord({
        employee_id: EMPLOYEE_ID,
        title: 'Test Guidance',
        content: 'Test guidance content',
      })
      expect(r.id).toBeDefined()
      recordId = r.id
    })

    it('should list guidance records', async () => {
      const result = await listGuidanceRecords()
      expect(result.records).toBeDefined()
    })

    it('should delete guidance record', async () => {
      await deleteGuidanceRecord(recordId)
    })
  })

  // ========================================================================
  // Tenko Records
  // ========================================================================
  describe('Tenko Records', () => {
    it('should list tenko records', async () => {
      const result = await listTenkoRecords()
      expect(result.records).toBeDefined()
    })
  })

  // ========================================================================
  // Auth: Unauthorized access
  // ========================================================================
  describe('Auth', () => {
    it('should reject request without auth', async () => {
      // Temporarily init with no auth
      initApi(API_BASE)
      await expect(getEmployees()).rejects.toThrow()
      // Restore auth
      initApi(API_BASE, () => jwtToken)
    })

    it('should reject request with invalid JWT', async () => {
      initApi(API_BASE, () => 'invalid-token')
      await expect(getEmployees()).rejects.toThrow()
      // Restore auth
      initApi(API_BASE, () => jwtToken)
    })

    it('should work with X-Tenant-ID (kiosk mode)', async () => {
      initApi(API_BASE, undefined, () => TENANT_ID)
      const employees = await getEmployees()
      expect(Array.isArray(employees)).toBe(true)
      // Restore JWT auth
      initApi(API_BASE, () => jwtToken)
    })
  })

  // ========================================================================
  // Daily Health & Vehicle Categories
  // ========================================================================
  describe('Misc endpoints', () => {
    it('should get daily health status', async () => {
      const result = await getDailyHealthStatus()
      expect(result).toBeDefined()
    })

    it('should get vehicle categories', async () => {
      const result = await getVehicleCategories()
      expect(result).toBeDefined()
    })
  })
})
