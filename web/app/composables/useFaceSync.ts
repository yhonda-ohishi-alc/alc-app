import type { FaceDataEntry } from '~/types'
import {
  getAllDescriptorsWithTimestamp,
  bulkSaveFaceDescriptors,
} from '~/utils/face-db'
import { getFaceData, updateEmployeeFace } from '~/utils/api'
import { FACE_MODEL_VERSION } from '~/composables/useFaceDetection'

// モジュールスコープ: 複数コンポーネントから同時に sync() が走らないようにする
let globalSyncing = false

export function useFaceSync() {
  const isSyncing = ref(false)
  const lastSyncAt = ref<number | null>(null)
  const syncError = ref<string | null>(null)

  async function sync() {
    if (globalSyncing) return
    globalSyncing = true
    isSyncing.value = true
    syncError.value = null

    try {
      // 1. サーバーの顔データ取得
      const serverData = await getFaceData()
      console.log(`[FaceSync] server: ${serverData.length} 件 (approved)`, serverData.map(e => ({ id: e.id.slice(0, 8), status: e.face_approval_status, ts: e.face_embedding_at })))

      // 2. ローカルの顔データ取得
      const localRecords = await getAllDescriptorsWithTimestamp()
      console.log(`[FaceSync] local: ${localRecords.length} 件`, localRecords.map(r => ({ id: r.employeeId.slice(0, 8), approval: r.approvalStatus, model: r.modelVersion, ts: new Date(r.updatedAt).toISOString() })))

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
      const toDownload: { employeeId: string; descriptor: number[]; updatedAt: number; modelVersion?: string }[] = []
      for (const [empId, serverEntry] of serverMap) {
        const serverTs = new Date(serverEntry.face_embedding_at).getTime()
        const local = localMap.get(empId)

        if (!local || serverTs > local.updatedAt) {
          console.log(`[FaceSync] download: ${empId.slice(0, 8)} (${!local ? 'new' : 'server newer'}, serverTs=${new Date(serverTs).toISOString()}, localTs=${local ? new Date(local.updatedAt).toISOString() : 'none'})`)
          toDownload.push({
            employeeId: empId,
            descriptor: serverEntry.face_embedding,
            updatedAt: serverTs,
            modelVersion: serverEntry.face_model_version ?? undefined,
          })
        } else {
          console.log(`[FaceSync] skip download: ${empId.slice(0, 8)} (local newer or equal, serverTs=${new Date(serverTs).toISOString()}, localTs=${new Date(local.updatedAt).toISOString()})`)
        }
      }

      if (toDownload.length > 0) {
        await bulkSaveFaceDescriptors(toDownload)
        console.log(`[FaceSync] ${toDownload.length} 件ダウンロード`)
      }

      // 4. Local → Remote: サーバーに承認済みデータがない場合のみアップロード
      const downloadedIds = new Set(toDownload.map(d => d.employeeId))
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      for (const [empId, localEntry] of localMap) {
        if (!uuidRegex.test(empId)) {
          console.warn(`[FaceSync] ${empId} は UUID でないためスキップ`)
          continue
        }
        if (downloadedIds.has(empId)) continue
        if (serverMap.has(empId)) continue

        try {
          await updateEmployeeFace(empId, undefined, localEntry.descriptor, FACE_MODEL_VERSION)
          console.log(`[FaceSync] ${empId} アップロード (新規)`)
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
      globalSyncing = false
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
