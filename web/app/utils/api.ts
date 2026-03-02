import type { ApiMeasurement, ApiEmployee, MeasurementsResponse, MeasurementFilter, MeasurementResult, FaceDataEntry } from '~/types'

let apiBase = ''
let getAccessToken: (() => string | null) | null = null
let getDeviceTenantId: (() => string | null) | null = null
let tokenRefresher: (() => Promise<void>) | null = null

// 同時リフレッシュ防止用
let refreshPromise: Promise<void> | null = null

export function initApi(
  baseUrl: string,
  tokenGetter?: () => string | null,
  tenantGetter?: () => string | null,
  refresher?: () => Promise<void>,
) {
  apiBase = baseUrl.replace(/\/$/, '')
  getAccessToken = tokenGetter || null
  getDeviceTenantId = tenantGetter || null
  tokenRefresher = refresher || null
}

/** 認証ヘッダーを構築 */
function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}

  // JWT 優先
  const token = getAccessToken?.()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    return headers
  }

  // フォールバック: キオスクモード (X-Tenant-ID)
  const tenantId = getDeviceTenantId?.()
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId
  }

  return headers
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBase) throw new Error('API 未初期化: initApi() を呼んでください')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(),
    ...(options.headers as Record<string, string> || {}),
  }

  const res = await fetch(`${apiBase}${path}`, { ...options, headers })

  // 401 → トークンリフレッシュ → リトライ (1回のみ)
  if (res.status === 401 && tokenRefresher && getAccessToken?.()) {
    try {
      if (!refreshPromise) {
        refreshPromise = tokenRefresher().finally(() => { refreshPromise = null })
      }
      await refreshPromise

      const retryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(),
        ...(options.headers as Record<string, string> || {}),
      }
      const retryRes = await fetch(`${apiBase}${path}`, { ...options, headers: retryHeaders })
      if (!retryRes.ok) {
        const body = await retryRes.text().catch(() => '')
        throw new Error(`API エラー (${retryRes.status}): ${body || retryRes.statusText}`)
      }
      if (retryRes.status === 204) return undefined as T
      return retryRes.json()
    } catch {
      // リフレッシュ失敗 → 元のエラーを投げる
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API エラー (${res.status}): ${body || res.statusText}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

/** 測定結果を保存 */
export async function saveMeasurement(result: MeasurementResult, facePhotoBlob?: Blob): Promise<ApiMeasurement> {
  let facePhotoUrl: string | undefined

  if (facePhotoBlob) {
    facePhotoUrl = await uploadFacePhoto(facePhotoBlob)
  }

  return request<ApiMeasurement>('/api/measurements', {
    method: 'POST',
    body: JSON.stringify({
      employee_id: result.employeeId,
      alcohol_value: result.alcoholValue,
      result_type: result.resultType,
      device_use_count: result.deviceUseCount,
      face_photo_url: facePhotoUrl || result.facePhotoUrl,
      measured_at: result.measuredAt.toISOString(),
      temperature: result.temperature,
      systolic: result.systolic,
      diastolic: result.diastolic,
      pulse: result.pulse,
      medical_measured_at: result.medicalMeasuredAt?.toISOString(),
    }),
  })
}

/** 測定履歴を取得 */
export async function getMeasurements(filter: MeasurementFilter = {}): Promise<MeasurementsResponse> {
  const params = new URLSearchParams()
  if (filter.employee_id) params.set('employee_id', filter.employee_id)
  if (filter.result_type) params.set('result_type', filter.result_type)
  if (filter.date_from) params.set('date_from', filter.date_from)
  if (filter.date_to) params.set('date_to', filter.date_to)
  if (filter.page) params.set('page', String(filter.page))
  if (filter.per_page) params.set('per_page', String(filter.per_page))

  const qs = params.toString()
  return request<MeasurementsResponse>(`/api/measurements${qs ? '?' + qs : ''}`)
}

/** 測定結果詳細を取得 */
export async function getMeasurement(id: string): Promise<ApiMeasurement> {
  return request<ApiMeasurement>(`/api/measurements/${id}`)
}

/** 乗務員一覧を取得 */
export async function getEmployees(): Promise<ApiEmployee[]> {
  return request<ApiEmployee[]>('/api/employees')
}

/** NFC IDで乗務員を検索 */
export async function getEmployeeByNfcId(nfcId: string): Promise<ApiEmployee> {
  return request<ApiEmployee>(`/api/employees/by-nfc/${encodeURIComponent(nfcId)}`)
}

/** 社員番号で乗務員を検索 */
export async function getEmployeeByCode(code: string): Promise<ApiEmployee> {
  return request<ApiEmployee>(`/api/employees/by-code/${encodeURIComponent(code)}`)
}

/** 乗務員を登録 */
export async function createEmployee(data: { code?: string; nfc_id?: string; name: string }): Promise<ApiEmployee> {
  return request<ApiEmployee>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** 乗務員情報を更新 */
export async function updateEmployee(id: string, data: { name: string; code?: string | null }): Promise<ApiEmployee> {
  return request<ApiEmployee>(`/api/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/** 乗務員を削除 (論理削除) */
export async function deleteEmployee(id: string): Promise<void> {
  await request<void>(`/api/employees/${id}`, {
    method: 'DELETE',
  })
}

/** 乗務員の顔写真 URL + 特徴量を更新 */
export async function updateEmployeeFace(
  id: string,
  facePhotoUrl?: string,
  faceEmbedding?: number[],
): Promise<ApiEmployee> {
  return request<ApiEmployee>(`/api/employees/${id}/face`, {
    method: 'PUT',
    body: JSON.stringify({
      face_photo_url: facePhotoUrl ?? null,
      face_embedding: faceEmbedding ?? null,
    }),
  })
}

/** 全乗務員の顔特徴量を取得 (同期用) */
export async function getFaceData(): Promise<FaceDataEntry[]> {
  return request<FaceDataEntry[]>('/api/employees/face-data')
}

/** 乗務員の NFC ID を更新 */
export async function updateEmployeeNfcId(id: string, nfcId: string): Promise<ApiEmployee> {
  return request<ApiEmployee>(`/api/employees/${id}/nfc`, {
    method: 'PUT',
    body: JSON.stringify({ nfc_id: nfcId }),
  })
}

/** 顔写真をアップロード */
export async function uploadFacePhoto(blob: Blob): Promise<string> {
  const formData = new FormData()
  formData.append('file', blob, 'face.jpg')

  if (!apiBase) throw new Error('API 未初期化')

  const authHeaders = buildAuthHeaders()
  const res = await fetch(`${apiBase}/api/upload/face-photo`, {
    method: 'POST',
    headers: authHeaders,
    body: formData,
  })

  if (!res.ok) throw new Error(`アップロード失敗 (${res.status})`)
  const data = await res.json()
  return data.url
}
