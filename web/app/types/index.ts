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

export type NfcEvent = NfcReadEvent | NfcErrorEvent

/** FC-1200 測定状態 */
export type Fc1200State =
  | 'idle'
  | 'waiting_connection'
  | 'connected'
  | 'warming_up'
  | 'blow_waiting'
  | 'measuring'
  | 'result_received'

/** 顔 embedding レコード */
export interface FaceRecord {
  employeeId: string
  descriptor: Float32Array
  updatedAt: number
}
