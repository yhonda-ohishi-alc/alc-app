import type { FaceDataEntry } from '~/types'
import {
  getAllDescriptorsWithTimestamp,
  bulkSaveFaceDescriptors,
} from '~/utils/face-db'
import { getFaceData, updateEmployeeFace } from '~/utils/api'

export function useFaceSync() {
  const isSyncing = ref(false)
  const lastSyncAt = ref<number | null>(null)
  const syncError = ref<string | null>(null)

  async function sync() {
    if (isSyncing.value) return
    isSyncing.value = true
    syncError.value = null

    try {
      // 1. サーバーの顔データ取得
      const serverData = await getFaceData()

      // 2. ローカルの顔データ取得
      const localRecords = await getAllDescriptorsWithTimestamp()

      const serverMap = new Map<string, FaceDataEntry>()
      for (const entry of serverData) {
        serverMap.set(entry.id, entry)
      }

      const localMap = new Map<string, { descriptor: number[]; updatedAt: number }>()
      for (const rec of localRecords) {
        localMap.set(rec.employeeId, {
          descriptor: Array.from(rec.descriptor),
          updatedAt: rec.updatedAt,
        })
      }

      // 3. Remote → Local: サーバーが新しければダウンロード
      const toDownload: { employeeId: string; descriptor: number[]; updatedAt: number }[] = []
      for (const [empId, serverEntry] of serverMap) {
        const serverTs = new Date(serverEntry.face_embedding_at).getTime()
        const local = localMap.get(empId)

        if (!local || serverTs > local.updatedAt) {
          toDownload.push({
            employeeId: empId,
            descriptor: serverEntry.face_embedding,
            updatedAt: serverTs,
          })
        }
      }

      if (toDownload.length > 0) {
        await bulkSaveFaceDescriptors(toDownload)
        console.log(`[FaceSync] ${toDownload.length} 件ダウンロード`)
      }

      // 4. Local → Remote: ローカルにしかないか、ローカルが新しければアップロード
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      for (const [empId, localEntry] of localMap) {
        // 非 UUID キー (旧データ) はスキップ
        if (!uuidRegex.test(empId)) {
          console.warn(`[FaceSync] ${empId} は UUID でないためスキップ`)
          continue
        }

        try {
          const serverEntry = serverMap.get(empId)

          if (!serverEntry) {
            // サーバーに無い → アップロード
            await updateEmployeeFace(empId, undefined, localEntry.descriptor)
            console.log(`[FaceSync] ${empId} アップロード (新規)`)
          } else {
            const serverTs = new Date(serverEntry.face_embedding_at).getTime()
            if (localEntry.updatedAt > serverTs) {
              // ローカルが新しい → アップロード
              await updateEmployeeFace(empId, undefined, localEntry.descriptor)
              console.log(`[FaceSync] ${empId} アップロード (更新)`)
            }
          }
        } catch (e) {
          console.error(`[FaceSync] ${empId} のアップロード失敗:`, e)
        }
      }

      lastSyncAt.value = Date.now()
    } catch (e) {
      syncError.value = e instanceof Error ? e.message : '顔データ同期エラー'
      console.error('[FaceSync] sync error:', e)
    } finally {
      isSyncing.value = false
    }
  }

  // マウント時に自動同期 (クライアントサイドのみ)
  if (import.meta.client) {
    onMounted(() => {
      // deviceTenantId も accessToken も無い場合は認証未準備 — 同期スキップ
      const { deviceTenantId, accessToken } = useAuth()
      if (!deviceTenantId.value && !accessToken.value) {
        console.warn('[FaceSync] 認証未準備のため初回同期スキップ')
        return
      }
      sync()
    })
  }

  return {
    isSyncing: readonly(isSyncing),
    lastSyncAt: readonly(lastSyncAt),
    syncError: readonly(syncError),
    sync,
  }
}
