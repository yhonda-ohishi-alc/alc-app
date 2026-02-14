import type { MeasurementResult } from '~/types'

const DB_NAME = 'alc-offline-db'
const DB_VERSION = 1
const STORE_NAME = 'pending-measurements'

/** キューに保存する際、measuredAt を ISO 文字列化したもの */
interface SerializedResult {
  employeeId: string
  alcoholValue: number
  resultType: 'normal' | 'over' | 'error'
  deviceUseCount: number
  facePhotoUrl?: string
  measuredAt: string
}

export interface PendingMeasurement {
  id: number
  result: SerializedResult
  facePhotoBase64?: string
  createdAt: string
  retryCount: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Blob を Base64 文字列に変換 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Base64 文字列を Blob に変換 */
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const header = parts[0] || ''
  const data = parts[1] || ''
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** オフライン測定結果をキューに追加 */
export async function enqueue(result: MeasurementResult, facePhotoBlob?: Blob): Promise<void> {
  const db = await openDb()
  const serialized: SerializedResult = {
    employeeId: result.employeeId,
    alcoholValue: result.alcoholValue,
    resultType: result.resultType,
    deviceUseCount: result.deviceUseCount,
    facePhotoUrl: result.facePhotoUrl,
    measuredAt: result.measuredAt.toISOString(),
  }
  const entry: Omit<PendingMeasurement, 'id'> = {
    result: serialized,
    facePhotoBase64: facePhotoBlob ? await blobToBase64(facePhotoBlob) : undefined,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** キュー内の全件を取得 */
export async function getAll(): Promise<PendingMeasurement[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** キューから 1 件削除 */
export async function remove(id: number): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** リトライ回数を更新 */
async function incrementRetry(id: number): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const entry = getReq.result as PendingMeasurement | undefined
      if (entry) {
        entry.retryCount++
        store.put(entry)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** 未送信件数を取得 */
export async function pendingCount(): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const MAX_RETRIES = 5

/** キュー内の測定結果を順次 API 送信 (オンライン復帰時に呼ぶ) */
export async function flush(
  saveFn: (result: MeasurementResult, blob?: Blob) => Promise<unknown>,
): Promise<{ sent: number; failed: number }> {
  const entries = await getAll()
  let sent = 0
  let failed = 0

  for (const entry of entries) {
    if (entry.retryCount >= MAX_RETRIES) {
      failed++
      continue
    }
    try {
      const result: MeasurementResult = {
        ...entry.result,
        measuredAt: new Date(entry.result.measuredAt),
      }
      const blob = entry.facePhotoBase64 ? base64ToBlob(entry.facePhotoBase64) : undefined
      await saveFn(result, blob)
      await remove(entry.id)
      sent++
    } catch {
      await incrementRetry(entry.id)
      failed++
    }
  }

  return { sent, failed }
}
