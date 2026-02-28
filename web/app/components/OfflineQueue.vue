<script setup lang="ts">
import { getEmployees } from '~/utils/api'

const {
  queueItems,
  pending,
  isSyncing,
  isOnline,
  removeItem,
  clearQueue,
  syncQueue,
  refreshQueue,
} = useOfflineSync()

// 従業員名ルックアップ
const employeeMap = ref<Record<string, string>>({})
async function loadEmployees() {
  try {
    const employees = await getEmployees()
    employeeMap.value = Object.fromEntries(employees.map(e => [e.id, e.name]))
  } catch {}
}
function employeeName(id: string) {
  return employeeMap.value[id] || id.slice(0, 8)
}

const isDeleting = ref<number | null>(null)
const isClearing = ref(false)

async function handleRemove(id: number) {
  isDeleting.value = id
  try {
    await removeItem(id)
  } finally {
    isDeleting.value = null
  }
}

async function handleClearAll() {
  if (!confirm('送信キュー内の全データを削除しますか？この操作は元に戻せません。')) return
  isClearing.value = true
  try {
    await clearQueue()
  } finally {
    isClearing.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function resultLabel(type: string) {
  switch (type) {
    case 'normal': return '正常'
    case 'over': return '基準超'
    case 'error': return 'エラー'
    default: return type
  }
}

function resultColor(type: string) {
  switch (type) {
    case 'normal': return 'bg-green-100 text-green-800'
    case 'over': return 'bg-red-100 text-red-800'
    case 'error': return 'bg-yellow-100 text-yellow-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

onMounted(() => {
  loadEmployees()
  refreshQueue()
})
</script>

<template>
  <div>
    <!-- アクションバー -->
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4 flex items-center justify-between">
      <p class="text-sm text-gray-600">
        未送信: <span class="font-bold">{{ pending }}</span> 件
      </p>
      <div class="flex gap-2">
        <button
          :disabled="pending === 0 || isSyncing || !isOnline"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          @click="syncQueue"
        >
          {{ isSyncing ? '送信中...' : '再送信' }}
        </button>
        <button
          :disabled="pending === 0 || isClearing"
          class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
          @click="handleClearAll"
        >
          {{ isClearing ? '削除中...' : '全件削除' }}
        </button>
      </div>
    </div>

    <!-- テーブル -->
    <div v-if="queueItems.length > 0" class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="px-4 py-3 text-left font-medium">キュー登録</th>
              <th class="px-4 py-3 text-left font-medium">測定日時</th>
              <th class="px-4 py-3 text-left font-medium">乗務員</th>
              <th class="px-4 py-3 text-right font-medium">アルコール値</th>
              <th class="px-4 py-3 text-center font-medium">結果</th>
              <th class="px-4 py-3 text-center font-medium">リトライ</th>
              <th class="px-4 py-3 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="item in queueItems" :key="item.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-gray-700">{{ formatDate(item.createdAt) }}</td>
              <td class="px-4 py-3 text-gray-700">{{ formatDate(item.result.measuredAt) }}</td>
              <td class="px-4 py-3 text-gray-700">{{ employeeName(item.result.employeeId) }}</td>
              <td class="px-4 py-3 text-right text-gray-700">
                {{ item.result.alcoholValue.toFixed(3) }} mg/L
              </td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-block px-2 py-1 rounded-full text-xs font-medium"
                  :class="resultColor(item.result.resultType)"
                >
                  {{ resultLabel(item.result.resultType) }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span
                  class="text-xs"
                  :class="item.retryCount >= 5 ? 'text-red-600 font-bold' : 'text-gray-500'"
                >
                  {{ item.retryCount }} / 5
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <button
                  :disabled="isDeleting === item.id"
                  class="px-3 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                  @click="handleRemove(item.id)"
                >
                  {{ isDeleting === item.id ? '...' : '削除' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 空状態 -->
    <div v-else class="text-center py-8 text-gray-500">
      送信キューは空です
    </div>
  </div>
</template>
