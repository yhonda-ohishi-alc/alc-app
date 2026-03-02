import type { MeasurementResult } from '~/types'
import type { PendingMeasurement } from '~/utils/offline-queue'
import { saveMeasurement, updateMeasurement } from '~/utils/api'
import { enqueue, flush, getAll, remove, clearAll } from '~/utils/offline-queue'

/** オフライン時のキューイング + オンライン復帰時の自動同期 */
export function useOfflineSync() {
  const isOnline = ref(true)
  const pending = ref(0)
  const queueItems = ref<PendingMeasurement[]>([])
  const isSyncing = ref(false)
  const lastSyncResult = ref<{ sent: number; failed: number } | null>(null)

  async function refreshQueue() {
    try {
      const items = await getAll()
      queueItems.value = items
      pending.value = items.length
    } catch {
      // IndexedDB エラーは無視
    }
  }

  /** 測定結果を保存 (オフラインならキュー、オンラインなら直接 API) */
  async function save(result: MeasurementResult, facePhotoBlob?: Blob, activeMeasurementId?: string): Promise<'saved' | 'queued'> {
    if (!isOnline.value) {
      await enqueue(result, facePhotoBlob, activeMeasurementId)
      await refreshQueue()
      return 'queued'
    }
    try {
      await saveMeasurement(result, facePhotoBlob)
      return 'saved'
    } catch {
      // API 失敗時もキューに退避
      await enqueue(result, facePhotoBlob, activeMeasurementId)
      await refreshQueue()
      return 'queued'
    }
  }

  /** キュー内の測定結果を一括送信 */
  async function syncQueue() {
    if (isSyncing.value || !isOnline.value) return
    isSyncing.value = true
    try {
      const result = await flush(saveMeasurement, updateMeasurement)
      lastSyncResult.value = result
      await refreshQueue()
    } finally {
      isSyncing.value = false
    }
  }

  /** キューから 1 件削除 */
  async function removeItem(id: number) {
    await remove(id)
    await refreshQueue()
  }

  /** キューを全件削除 */
  async function clearQueue() {
    await clearAll()
    await refreshQueue()
  }

  if (import.meta.client) {
    isOnline.value = navigator.onLine

    const handleOnline = () => {
      isOnline.value = true
      syncQueue()
    }
    const handleOffline = () => {
      isOnline.value = false
    }

    onMounted(() => {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      refreshQueue()
    })

    onUnmounted(() => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    })
  }

  return {
    isOnline: readonly(isOnline),
    pending: readonly(pending),
    queueItems: readonly(queueItems),
    isSyncing: readonly(isSyncing),
    lastSyncResult: readonly(lastSyncResult),
    save,
    syncQueue,
    removeItem,
    clearQueue,
    refreshQueue,
  }
}
