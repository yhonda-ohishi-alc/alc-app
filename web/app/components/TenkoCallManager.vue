<script setup lang="ts">
interface TenkoCallNumber {
  id: number
  call_number: string
  tenant_id: string
  label: string | null
  created_at: string
}

interface TenkoCallDriver {
  id: number
  phone_number: string
  driver_name: string
  call_number: string | null
  tenant_id: string
  created_at: string
}

const numbers = ref<TenkoCallNumber[]>([])
const drivers = ref<TenkoCallDriver[]>([])
const loading = ref(false)
const error = ref('')

// 新規登録フォーム
const newCallNumber = ref('')
const newLabel = ref('')
const adding = ref(false)

const { accessToken, deviceTenantId } = useAuth()

function authHeaders() {
  const h: Record<string, string> = {}
  if (accessToken.value) h['Authorization'] = `Bearer ${accessToken.value}`
  if (deviceTenantId.value) h['X-Tenant-ID'] = deviceTenantId.value
  return h
}

async function fetchData() {
  loading.value = true
  error.value = ''
  try {
    const [nums, drvs] = await Promise.all([
      $fetch<TenkoCallNumber[]>('/api/tenko-call/numbers', { headers: authHeaders() }),
      $fetch<TenkoCallDriver[]>('/api/tenko-call/drivers', { headers: authHeaders() }),
    ])
    numbers.value = nums
    drivers.value = drvs
  } catch (e: any) {
    error.value = e.message || '取得に失敗しました'
  } finally {
    loading.value = false
  }
}

async function addNumber() {
  if (!newCallNumber.value.trim()) return
  adding.value = true
  error.value = ''
  try {
    await $fetch('/api/tenko-call/numbers', {
      method: 'POST',
      headers: authHeaders(),
      body: {
        call_number: newCallNumber.value.trim(),
        label: newLabel.value.trim() || null,
      },
    })
    newCallNumber.value = ''
    newLabel.value = ''
    await fetchData()
  } catch (e: any) {
    error.value = e.message || '追加に失敗しました'
  } finally {
    adding.value = false
  }
}

async function removeNumber(id: number) {
  if (!confirm('この点呼用番号を削除しますか？')) return
  try {
    await $fetch(`/api/tenko-call/numbers/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    await fetchData()
  } catch (e: any) {
    error.value = e.message || '削除に失敗しました'
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="space-y-6">
    <!-- 点呼用番号マスタ -->
    <div class="bg-white rounded-xl p-4 shadow-sm">
      <h3 class="text-sm font-semibold text-gray-800 mb-3">点呼用電話番号</h3>

      <!-- 追加フォーム -->
      <div class="flex gap-2 mb-4">
        <input
          v-model="newCallNumber"
          type="tel"
          placeholder="電話番号 (例: 0312345678)"
          class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
        <input
          v-model="newLabel"
          type="text"
          placeholder="ラベル (任意)"
          class="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
        <button
          :disabled="adding || !newCallNumber.trim()"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          @click="addNumber"
        >
          追加
        </button>
      </div>

      <!-- 一覧 -->
      <div v-if="numbers.length" class="divide-y">
        <div v-for="num in numbers" :key="num.id" class="flex items-center justify-between py-2">
          <div>
            <span class="font-mono text-sm">{{ num.call_number }}</span>
            <span v-if="num.label" class="ml-2 text-xs text-gray-500">{{ num.label }}</span>
          </div>
          <button
            class="text-red-500 hover:text-red-700 text-xs"
            @click="removeNumber(num.id)"
          >
            削除
          </button>
        </div>
      </div>
      <p v-else class="text-sm text-gray-400">登録された番号はありません</p>
    </div>

    <!-- 登録済みドライバー一覧 -->
    <div class="bg-white rounded-xl p-4 shadow-sm">
      <h3 class="text-sm font-semibold text-gray-800 mb-3">登録済みドライバー</h3>

      <div v-if="drivers.length" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-gray-500 border-b">
            <tr>
              <th class="pb-2 pr-4">電話番号</th>
              <th class="pb-2 pr-4">名前</th>
              <th class="pb-2 pr-4">点呼先</th>
              <th class="pb-2">登録日</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="d in drivers" :key="d.id">
              <td class="py-2 pr-4 font-mono">{{ d.phone_number }}</td>
              <td class="py-2 pr-4">{{ d.driver_name }}</td>
              <td class="py-2 pr-4 font-mono">{{ d.call_number || '-' }}</td>
              <td class="py-2 text-gray-500 text-xs">{{ d.created_at?.slice(0, 10) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-gray-400">登録ドライバーはいません</p>
    </div>

    <!-- エラー表示 -->
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <!-- ローディング -->
    <div v-if="loading" class="text-center text-gray-400 text-sm">読み込み中...</div>
  </div>
</template>
