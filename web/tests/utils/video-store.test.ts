import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  saveVideo,
  getVideo,
  getPendingVideos,
  markVideoUploaded,
  cleanupOldVideos,
  deleteVideo,
} from '~/utils/video-store'

describe('video-store', () => {
  beforeEach(() => {
    // 毎回新しい IDBFactory でクリーンな状態にする
    globalThis.indexedDB = new IDBFactory()
  })

  it('saveVideo + getVideo で保存・取得', async () => {
    const blob = new Blob(['test-video-data'], { type: 'video/webm' })
    await saveVideo('vid-001', blob, 'emp-001', 'meas-001')

    const record = await getVideo('vid-001')
    expect(record).toBeDefined()
    expect(record!.id).toBe('vid-001')
    expect(record!.employeeId).toBe('emp-001')
    expect(record!.measurementId).toBe('meas-001')
    expect(record!.videoBlob).toBeDefined()
    expect(record!.createdAt).toBeDefined()
    expect(record!.uploadedAt).toBeUndefined()
  })

  it('存在しない ID は undefined', async () => {
    const record = await getVideo('nonexistent')
    expect(record).toBeUndefined()
  })

  it('getPendingVideos は未アップロードのみ返す', async () => {
    const blob = new Blob(['data'])
    await saveVideo('vid-a', blob, 'emp-001')
    await saveVideo('vid-b', blob, 'emp-002')

    await markVideoUploaded('vid-a')

    const pending = await getPendingVideos()
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe('vid-b')
  })

  it('markVideoUploaded で uploadedAt が設定される', async () => {
    const blob = new Blob(['data'])
    await saveVideo('vid-001', blob, 'emp-001')

    await markVideoUploaded('vid-001')

    const record = await getVideo('vid-001')
    expect(record!.uploadedAt).toBeDefined()
  })

  it('markVideoUploaded は存在しない ID でもエラーにならない', async () => {
    await markVideoUploaded('nonexistent')
  })

  it('deleteVideo で削除', async () => {
    const blob = new Blob(['data'])
    await saveVideo('vid-001', blob, 'emp-001')
    await deleteVideo('vid-001')

    const record = await getVideo('vid-001')
    expect(record).toBeUndefined()
  })

  it('getPendingVideos は空のDBで空配列を返す', async () => {
    const pending = await getPendingVideos()
    expect(pending).toEqual([])
  })

  it('getPendingVideos は全てアップロード済みなら空配列', async () => {
    const blob = new Blob(['data'])
    await saveVideo('vid-1', blob, 'emp-001')
    await saveVideo('vid-2', blob, 'emp-002')
    await markVideoUploaded('vid-1')
    await markVideoUploaded('vid-2')

    const pending = await getPendingVideos()
    expect(pending).toEqual([])
  })

  it('saveVideo は measurementId なしでも保存できる', async () => {
    const blob = new Blob(['data'], { type: 'video/webm' })
    await saveVideo('vid-no-meas', blob, 'emp-001')

    const record = await getVideo('vid-no-meas')
    expect(record).toBeDefined()
    expect(record!.measurementId).toBeUndefined()
  })

  it('cleanupOldVideos は新しい録画のみなら 0 を返す', async () => {
    const blob = new Blob(['data'])
    await saveVideo('vid-new', blob, 'emp-001')

    const deleted = await cleanupOldVideos(7)
    expect(deleted).toBe(0)

    expect(await getVideo('vid-new')).toBeDefined()
  })

  it('cleanupOldVideos は空のDBで 0 を返す', async () => {
    const deleted = await cleanupOldVideos(7)
    expect(deleted).toBe(0)
  })

  it('deleteVideo は存在しない ID でもエラーにならない', async () => {
    await expect(deleteVideo('nonexistent')).resolves.not.toThrow()
  })

  it('cleanupOldVideos は古い録画を削除', async () => {
    const blob = new Blob(['data'])
    await saveVideo('vid-old', blob, 'emp-001')

    // createdAt を 10 日前に書き換え
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('alc-video-db', 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction('blow-videos', 'readwrite').objectStore('blow-videos')
      const getReq = store.get('vid-old')
      getReq.onsuccess = () => {
        const record = getReq.result
        const old = new Date()
        old.setDate(old.getDate() - 10)
        record.createdAt = old.toISOString()
        const putReq = store.put(record)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      getReq.onerror = () => reject(getReq.error)
    })
    db.close()

    await saveVideo('vid-new', blob, 'emp-002')

    const deleted = await cleanupOldVideos(7)
    expect(deleted).toBe(1)

    expect(await getVideo('vid-old')).toBeUndefined()
    expect(await getVideo('vid-new')).toBeDefined()
  })
})
