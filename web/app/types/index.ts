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
}

export type NfcEvent = NfcReadEvent | NfcErrorEvent

/** NFC WebSocket イベント (全種別) */
export type NfcWebSocketEvent = NfcReadEvent | NfcErrorEvent | NfcStatusEvent

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
  type: 'state_changed' | 'measurement_result' | 'error'
  state?: Fc1200State
  alcohol_value?: number
  result_type?: 'normal' | 'over' | 'error'
  use_count?: number
  error_code?: string
  message?: string
}

/** 顔 embedding レコード */
export interface FaceRecord {
  employeeId: string
  descriptor: Float32Array
  updatedAt: number
}
