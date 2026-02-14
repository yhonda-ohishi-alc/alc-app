import type { ApiMeasurement, ApiEmployee, MeasurementsResponse, MeasurementFilter, MeasurementResult } from '~/types'

let apiBase = ''

export function initApi(baseUrl: string) {
  apiBase = baseUrl.replace(/\/$/, '')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBase) throw new Error('API 未初期化: initApi() を呼んでください')

  const config = useRuntimeConfig()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': config.public.tenantId as string || 'default',
    ...(options.headers as Record<string, string> || {}),
  }

  const res = await fetch(`${apiBase}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API エラー (${res.status}): ${body || res.statusText}`)
  }
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

/** 乗務員を登録 */
export async function createEmployee(data: { nfc_id: string; name: string }): Promise<ApiEmployee> {
  return request<ApiEmployee>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** 顔写真をアップロード */
export async function uploadFacePhoto(blob: Blob): Promise<string> {
  const formData = new FormData()
  formData.append('file', blob, 'face.jpg')

  if (!apiBase) throw new Error('API 未初期化')

  const config = useRuntimeConfig()
  const res = await fetch(`${apiBase}/api/upload/face-photo`, {
    method: 'POST',
    headers: {
      'X-Tenant-ID': config.public.tenantId as string || 'default',
    },
    body: formData,
  })

  if (!res.ok) throw new Error(`アップロード失敗 (${res.status})`)
  const data = await res.json()
  return data.url
}
