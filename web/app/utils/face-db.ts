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

export async function saveFaceDescriptor(employeeId: string, descriptor: number[]): Promise<void> {
  const db = await openDb()
  const record: FaceRecord = {
    employeeId,
    descriptor: new Float32Array(descriptor),
    updatedAt: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getFaceDescriptor(employeeId: string): Promise<number[] | null> {
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

export async function getAllDescriptors(): Promise<{ employeeId: string; descriptor: number[] }[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      const records = request.result as FaceRecord[]
      resolve(records.map(r => ({
        employeeId: r.employeeId,
        descriptor: Array.from(r.descriptor),
      })))
    }
    request.onerror = () => reject(request.error)
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
