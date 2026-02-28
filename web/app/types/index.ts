/** 顔認証結果 */
export interface FaceAuthResult {
  verified: boolean
  similarity: number
  snapshot?: Blob
}

/** 測定結果 */
export interface MeasurementResult {
  employeeId: string
  alcoholValue: number
  resultType: 'normal' | 'over' | 'error'
  deviceUseCount: number
  facePhotoUrl?: string
  measuredAt: Date
}

/** NFC 読み取りイベント */
export interface NfcReadEvent {
  type: 'nfc_read'
  employee_id: string
}

/** NFC 免許証読み取りイベント */
export interface NfcLicenseReadEvent {
  type: 'nfc_license_read'
  card_id: string
  card_type: 'driver_license' | 'car_inspection' | 'other'
  atr: string
  expiry_date?: string
  remain_count?: number
  felica_uid?: string
}

/** NFC デバッグイベント (APDU ステップログ) */
export interface NfcDebugEvent {
  type: 'nfc_debug'
  message: string
}

/** NFC エラーイベント */
export interface NfcErrorEvent {
  type: 'nfc_error'
  error: string
}

/** NFC ステータスイベント */
export interface NfcStatusEvent {
  type: 'status'
  readers: string[]
  connected: boolean
  version?: string
}

export type NfcEvent = NfcReadEvent | NfcErrorEvent

/** NFC WebSocket イベント (全種別) */
export type NfcWebSocketEvent = NfcReadEvent | NfcLicenseReadEvent | NfcDebugEvent | NfcErrorEvent | NfcStatusEvent

/** FC-1200 測定状態 */
export type Fc1200State =
  | 'idle'
  | 'waiting_connection'
  | 'connected'
  | 'warming_up'
  | 'blow_waiting'
  | 'measuring'
  | 'result_received'

/** FC-1200 WASM イベント (feed() が返す JSON 配列の要素) */
export interface Fc1200Event {
  type: 'state_changed' | 'measurement_result' | 'usage_time' | 'memory_data' | 'date_update_response' | 'error'
  from?: string
  to?: Fc1200State
  alcohol_value?: number
  result_type?: 'normal' | 'over' | 'error'
  use_count?: number
  error_code?: string
  message?: string
  // usage_time (RQUT)
  total_seconds?: number
  elapsed_days?: number
  // memory_data (RQDD)
  id?: string
  datetime?: string
  // date_update_response
  success?: boolean
}

/** FC-1200 センサ寿命情報 */
export interface SensorLifetime {
  totalSeconds: number
  elapsedDays: number
}

/** FC-1200 メモリデータ */
export interface MemoryRecord {
  id: string
  datetime: string
  alcoholValue: number
}

/** 顔 embedding レコード */
export interface FaceRecord {
  employeeId: string
  descriptor: Float32Array
  updatedAt: number
}

/** API: 測定結果 (サーバー側) */
export interface ApiMeasurement {
  id: string
  tenant_id: string
  employee_id: string
  alcohol_value: number
  result_type: 'normal' | 'over' | 'error'
  device_use_count: number
  face_photo_url?: string
  measured_at: string
  created_at: string
}

/** API: 乗務員 */
export interface ApiEmployee {
  id: string
  tenant_id: string
  code?: string | null
  nfc_id?: string | null
  name: string
  face_photo_url?: string | null
  face_embedding_at?: string | null
  created_at: string
  updated_at: string
}

/** 顔特徴量同期用データ */
export interface FaceDataEntry {
  id: string
  face_embedding: number[]
  face_embedding_at: string
}

/** API: 測定結果一覧レスポンス */
export interface MeasurementsResponse {
  measurements: ApiMeasurement[]
  total: number
  page: number
  per_page: number
}

/** API: 測定フィルタ */
export interface MeasurementFilter {
  employee_id?: string
  result_type?: 'normal' | 'over' | 'error'
  date_from?: string
  date_to?: string
  page?: number
  per_page?: number
}

/** 認証ユーザー */
export interface AuthUser {
  id: string
  email: string
  name: string
  tenant_id: string
  role: 'admin' | 'viewer'
}

/** ログインレスポンス */
export interface AuthResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  user: AuthUser
}

/** リフレッシュレスポンス */
export interface RefreshResponse {
  access_token: string
  expires_in: number
}

/** シグナリングメッセージ (クライアント → サーバー) */
export interface SignalingOutMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'ping'
  sdp?: string
  candidate?: RTCIceCandidateInit
}

/** シグナリングメッセージ (サーバー → クライアント) */
export interface SignalingInMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'peer_joined' | 'peer_left' | 'error' | 'pong'
  sdp?: string
  candidate?: RTCIceCandidateInit
  role?: 'device' | 'admin'
  message?: string
}
