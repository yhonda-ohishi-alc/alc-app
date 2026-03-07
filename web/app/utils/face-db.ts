import type { FaceRecord } from '~/types'

const DB_NAME = 'alc-face-db'
const DB_VERSION = 1
const STORE_NAME = 'faces'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'employeeId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveFaceDescriptor(
  employeeId: string,
  descriptor: number[],
  approvalStatus: FaceRecord['approvalStatus'] = 'approved',
  modelVersion?: string,
): Promise<void> {
  const db = await openDb()
  const record: FaceRecord = {
    employeeId,
    descriptor: new Float32Array(descriptor),
    updatedAt: Date.now(),
    approvalStatus,
    modelVersion,
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** approved かつ現行モデルバージョンのみ返す (顔認証用) */
export async function getFaceDescriptor(employeeId: string, currentModelVersion?: string): Promise<number[] | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(employeeId)
    request.onsuccess = () => {
      const record = request.result as FaceRecord | undefined
      if (!record) return resolve(null)
      if (record.approvalStatus && record.approvalStatus !== 'approved') return resolve(null)
      if (currentModelVersion && record.modelVersion && record.modelVersion !== currentModelVersion) return resolve(null)
      resolve(Array.from(record.descriptor))
    }
    request.onerror = () => reject(request.error)
  })
}

/** approvalStatus を無視して descriptor を取得 (サーバーアップロード用) */
export async function getRawFaceDescriptor(employeeId: string): Promise<number[] | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(employeeId)
    request.onsuccess = () => {
      const record = request.result as FaceRecord | undefined
      resolve(record ? Array.from(record.descriptor) : null)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getAllDescriptors(currentModelVersion?: string): Promise<{ employeeId: string; descriptor: number[] }[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      const records = request.result as FaceRecord[]
      resolve(records
        .filter(r => !r.approvalStatus || r.approvalStatus === 'approved')
        .filter(r => !currentModelVersion || !r.modelVersion || r.modelVersion === currentModelVersion)
        .map(r => ({
          employeeId: r.employeeId,
          descriptor: Array.from(r.descriptor),
        })))
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getAllDescriptorsWithTimestamp(): Promise<FaceRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      resolve(request.result as FaceRecord[])
    }
    request.onerror = () => reject(request.error)
  })
}

export async function bulkSaveFaceDescriptors(
  records: { employeeId: string; descriptor: number[]; updatedAt: number; modelVersion?: string }[],
): Promise<void> {
  if (records.length === 0) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    for (const r of records) {
      store.put({
        employeeId: r.employeeId,
        descriptor: new Float32Array(r.descriptor),
        updatedAt: r.updatedAt,
        approvalStatus: 'approved',
        modelVersion: r.modelVersion,
      } satisfies FaceRecord)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteFaceDescriptor(employeeId: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(employeeId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
