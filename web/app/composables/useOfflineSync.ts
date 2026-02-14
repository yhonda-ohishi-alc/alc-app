import type { MeasurementResult } from '~/types'
import { saveMeasurement } from '~/utils/api'
import { enqueue, flush, pendingCount } from '~/utils/offline-queue'

/** オフライン時のキューイング + オンライン復帰時の自動同期 */
export function useOfflineSync() {
  const isOnline = ref(true)
  const pending = ref(0)
  const isSyncing = ref(false)
  const lastSyncResult = ref<{ sent: number; failed: number } | null>(null)

  async function refreshPending() {
    try {
      pending.value = await pendingCount()
    } catch {
      // IndexedDB エラーは無視
    }
  }

  /** 測定結果を保存 (オフラインならキュー、オンラインなら直接 API) */
  async function save(result: MeasurementResult, facePhotoBlob?: Blob): Promise<'saved' | 'queued'> {
    if (!isOnline.value) {
      await enqueue(result, facePhotoBlob)
      await refreshPending()
      return 'queued'
    }
    try {
      await saveMeasurement(result, facePhotoBlob)
      return 'saved'
    } catch {
      // API 失敗時もキューに退避
      await enqueue(result, facePhotoBlob)
      await refreshPending()
      return 'queued'
    }
  }

  /** キュー内の測定結果を一括送信 */
  async function syncQueue() {
    if (isSyncing.value || !isOnline.value) return
    isSyncing.value = true
    try {
      const result = await flush(saveMeasurement)
      lastSyncResult.value = result
      await refreshPending()
    } finally {
      isSyncing.value = false
    }
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
      refreshPending()
    })

    onUnmounted(() => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    })
  }

  return {
    isOnline: readonly(isOnline),
    pending: readonly(pending),
    isSyncing: readonly(isSyncing),
    lastSyncResult: readonly(lastSyncResult),
    save,
    syncQueue,
  }
}
