/**
 * API テスト用の共通データ定義
 *
 * mock テスト (api.test.ts) と integration テスト (api-live.test.ts) の両方で使用。
 * スキーマ変更時はここだけ修正すれば両方のテストに反映される。
 */

// ---------------------------------------------------------------------------
// IDs (integration test seed data と一致)
// ---------------------------------------------------------------------------
export const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111'
export const TEST_USER_ID = '22222222-2222-2222-2222-222222222222'
export const TEST_EMPLOYEE_ID = '33333333-3333-3333-3333-333333333333'

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------
export const JWT_SECRET = 'test-jwt-secret-for-integration'

// ---------------------------------------------------------------------------
// Request bodies (実 API が受け付ける正しいフィールド名)
// ---------------------------------------------------------------------------

export const createScheduleBody = {
  employee_id: TEST_EMPLOYEE_ID,
  tenko_type: 'pre_operation',
  responsible_manager_name: 'Test Manager',
  scheduled_at: new Date().toISOString(),
  instruction: 'Test instruction',
}

export const createEquipmentFailureBody = {
  failure_type: 'manual_report',
  description: 'Test failure',
}

export const createWebhookBody = {
  url: 'https://example.com/webhook',
  event_type: 'tenko_completed',
}

export const createCarryingItemBody = {
  item_name: 'Test Item',
}

export const createGuidanceRecordBody = {
  employee_id: TEST_EMPLOYEE_ID,
  title: 'Test Guidance',
  content: 'Test guidance content',
}

export const createCommunicationItemBody = {
  title: 'Test Notice',
  body: 'Test content',
}

export const createHealthBaselineBody = {
  employee_id: TEST_EMPLOYEE_ID,
  baseline_systolic: 120,
  baseline_diastolic: 80,
  baseline_temperature: 36.5,
}

export const createTimecardCardBody = {
  card_id: 'NFC-TEST-CARD-001',
  employee_id: TEST_EMPLOYEE_ID,
}

export const startTenkoSessionBody = {
  employee_id: TEST_EMPLOYEE_ID,
  tenko_type: 'pre_operation',
}

export const createEmployeeBody = {
  name: 'New Driver',
  code: 'E999',
}
