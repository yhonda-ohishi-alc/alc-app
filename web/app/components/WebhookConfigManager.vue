<script setup lang="ts">
import type { WebhookConfig, WebhookDelivery, CreateWebhookConfig } from '~/types'
import { listWebhooks, createWebhook, deleteWebhook, getWebhookDeliveries } from '~/utils/api'

const configs = ref<WebhookConfig[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

const eventTypes = [
  { value: 'alcohol_detected', label: 'アルコール検出' },
  { value: 'tenko_overdue', label: '点呼遅延' },
  { value: 'tenko_completed', label: '点呼完了' },
  { value: 'tenko_cancelled', label: '点呼キャンセル' },
  { value: 'tenko_interrupted', label: '点呼中断' },
  { value: 'inspection_ng', label: '日常点検NG' },
  { value: 'safety_judgment_fail', label: '安全判定不合格' },
  { value: 'equipment_failure', label: '機器故障' },
]

function eventLabel(t: string) {
  return eventTypes.find(e => e.value === t)?.label || t
}

async function fetchData() {
  isLoading.value = true
  error.value = null
  try {
    configs.value = await listWebhooks()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '取得エラー'
  } finally {
    isLoading.value = false
  }
}

// 新規作成
const showForm = ref(false)
const isSaving = ref(false)
const newForm = ref<CreateWebhookConfig>({ event_type: '', url: '', enabled: true })

async function handleCreate() {
  if (!newForm.value.event_type || !newForm.value.url.trim()) return
  isSaving.value = true
  error.value = null
  try {
    await createWebhook({ ...newForm.value, url: newForm.value.url.trim() })
    newForm.value = { event_type: '', url: '', enabled: true }
    showForm.value = false
    await fetchData()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '作成エラー'
  } finally {
    isSaving.value = false
  }
}

// 削除
const deletingId = ref<string | null>(null)
const isDeleting = ref(false)

async function handleDelete(id: string) {
  isDeleting.value = true
  error.value = null
  try {
    await deleteWebhook(id)
    deletingId.value = null
    if (selectedConfigId.value === id) {
      selectedConfigId.value = null
      deliveries.value = []
    }
    await fetchData()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '削除エラー'
  } finally {
    isDeleting.value = false
  }
}

// 配信履歴
const selectedConfigId = ref<string | null>(null)
const deliveries = ref<WebhookDelivery[]>([])
const isLoadingDeliveries = ref(false)

async function loadDeliveries(configId: string) {
  if (selectedConfigId.value === configId) {
    selectedConfigId.value = null
    deliveries.value = []
    return
  }
  selectedConfigId.value = configId
  isLoadingDeliveries.value = true
  try {
    deliveries.value = await getWebhookDeliveries(configId)
  } catch {
    deliveries.value = []
  } finally {
    isLoadingDeliveries.value = false
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

onMounted(() => fetchData())
</script>

<template>
  <div>
    <!-- ヘッダ -->
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-600">
          設定数: <strong class="text-gray-800">{{ configs.length }}</strong>
        </p>
        <div class="flex gap-2">
          <button
            class="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
            @click="showForm = !showForm"
          >{{ showForm ? '閉じる' : '+ 新規作成' }}</button>
          <button class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors" @click="fetchData">更新</button>
        </div>
      </div>
    </div>

    <!-- 新規作成フォーム -->
    <div v-if="showForm" class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <h3 class="text-sm font-medium text-gray-700 mb-3">Webhook設定を追加</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs text-gray-500 mb-1">イベント種別</label>
          <select v-model="newForm.event_type" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">選択</option>
            <option v-for="et in eventTypes" :key="et.value" :value="et.value">{{ et.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">URL</label>
          <input v-model="newForm.url" type="url" placeholder="https://..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">有効</label>
          <div class="flex items-center h-[38px]">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input v-model="newForm.enabled" type="checkbox" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
              <span>{{ newForm.enabled ? '有効' : '無効' }}</span>
            </label>
          </div>
        </div>
      </div>
      <button
        :disabled="!newForm.event_type || !newForm.url.trim() || isSaving"
        class="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
        @click="handleCreate"
      >{{ isSaving ? '作成中...' : '作成' }}</button>
    </div>

    <!-- エラー -->
    <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{{ error }}</div>

    <!-- ローディング -->
    <div v-if="isLoading" class="text-center py-8 text-gray-500">読み込み中...</div>

    <!-- テーブル -->
    <div v-else-if="configs.length > 0" class="space-y-2">
      <div v-for="c in configs" :key="c.id" class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3">
          <div class="flex items-center gap-3">
            <span class="inline-block px-2 py-1 rounded-full text-xs font-medium"
              :class="c.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'">
              {{ c.enabled ? '有効' : '無効' }}
            </span>
            <span class="text-sm font-medium text-gray-800">{{ eventLabel(c.event_type) }}</span>
            <span class="text-sm text-gray-500 font-mono truncate max-w-[300px]">{{ c.url }}</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs" @click="loadDeliveries(c.id)">
              {{ selectedConfigId === c.id ? '履歴を閉じる' : '配信履歴' }}
            </button>
            <button
              v-if="deletingId === c.id"
              :disabled="isDeleting"
              class="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
              @click="handleDelete(c.id)"
            >{{ isDeleting ? '削除中...' : '本当に削除' }}</button>
            <button v-else class="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs" @click="deletingId = c.id">削除</button>
          </div>
        </div>

        <!-- 配信履歴 -->
        <div v-if="selectedConfigId === c.id" class="border-t border-gray-100">
          <div v-if="isLoadingDeliveries" class="px-4 py-3 text-sm text-gray-500">読み込み中...</div>
          <div v-else-if="deliveries.length === 0" class="px-4 py-3 text-sm text-gray-500">配信履歴がありません</div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-gray-50 text-gray-500">
                <tr>
                  <th class="px-4 py-2 text-left font-medium">日時</th>
                  <th class="px-4 py-2 text-center font-medium">結果</th>
                  <th class="px-4 py-2 text-center font-medium">ステータス</th>
                  <th class="px-4 py-2 text-center font-medium">試行</th>
                  <th class="px-4 py-2 text-left font-medium">レスポンス</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                <tr v-for="d in deliveries" :key="d.id">
                  <td class="px-4 py-2 text-gray-600">{{ formatDate(d.created_at) }}</td>
                  <td class="px-4 py-2 text-center">
                    <span class="inline-block px-2 py-0.5 rounded-full font-medium"
                      :class="d.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                      {{ d.success ? '成功' : '失敗' }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-center text-gray-600">{{ d.status_code || '-' }}</td>
                  <td class="px-4 py-2 text-center text-gray-600">{{ d.attempt }}</td>
                  <td class="px-4 py-2 text-gray-500 truncate max-w-[200px]">{{ d.response_body || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状態 -->
    <div v-else class="text-center py-8 text-gray-500">Webhook設定がありません</div>
  </div>
</template>
