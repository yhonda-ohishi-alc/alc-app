/**
 * IndexedDB ストア: 測定時の録画をローカルに保存
 * - 録画直後にローカル保存、バックグラウンドでR2にアップロード
 * - 7日で自動クリーンアップ
 */

const DB_NAME = 'alc-video-db'
const DB_VERSION = 1
const STORE_NAME = 'blow-videos'

export interface VideoRecord {
  id: string // UUID
  videoBlob: Blob
  employeeId: string
  measurementId?: string
  createdAt: string // ISO
  uploadedAt?: string // ISO, set after successful upload
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

/** 録画を保存 */
export async function saveVideo(
  id: string,
  blob: Blob,
  employeeId: string,
  measurementId?: string,
): Promise<void> {
  const db = await openDb()
  const record: VideoRecord = {
    id,
    videoBlob: blob,
    employeeId,
    measurementId,
    createdAt: new Date().toISOString(),
  }
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(record)
    req.onsuccess = () => {
      console.log('[VideoStore] Saved video:', id, `${(blob.size / 1024).toFixed(0)}KB`)
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

/** 録画を取得 */
export async function getVideo(id: string): Promise<VideoRecord | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 未アップロードの録画一覧 */
export async function getPendingVideos(): Promise<VideoRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll()
    req.onsuccess = () => {
      const all = req.result as VideoRecord[]
      resolve(all.filter(r => !r.uploadedAt))
    }
    req.onerror = () => reject(req.error)
  })
}

/** アップロード完了マーク */
export async function markVideoUploaded(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite')
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const record = getReq.result as VideoRecord | undefined
      if (!record) { resolve(); return }
      record.uploadedAt = new Date().toISOString()
      const putReq = store.put(record)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

/** 古い録画を削除 (retentionDays 日超過) */
export async function cleanupOldVideos(retentionDays = 7): Promise<number> {
  const db = await openDb()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  const cutoffIso = cutoff.toISOString()

  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite')
    const req = store.getAll()
    req.onsuccess = () => {
      const all = req.result as VideoRecord[]
      let deleted = 0
      for (const record of all) {
        if (record.createdAt < cutoffIso) {
          store.delete(record.id)
          deleted++
        }
      }
      console.log(`[VideoStore] Cleanup: deleted ${deleted} videos older than ${retentionDays} days`)
      resolve(deleted)
    }
    req.onerror = () => reject(req.error)
  })
}

/** 録画を削除 */
export async function deleteVideo(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}
