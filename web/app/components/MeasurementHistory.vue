<script setup lang="ts">
import type { ApiMeasurement, ApiEmployee, MeasurementFilter } from '~/types'
import { getMeasurements, getEmployees } from '~/utils/api'

const measurements = ref<ApiMeasurement[]>([])
const total = ref(0)
const page = ref(1)
const perPage = 20
const isLoading = ref(false)
const error = ref<string | null>(null)

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

// フィルタ
const filterEmployeeId = ref('')
const filterResultType = ref<'' | 'normal' | 'over' | 'error'>('')
const filterDateFrom = ref('')
const filterDateTo = ref('')

async function fetchData() {
  isLoading.value = true
  error.value = null
  try {
    const filter: MeasurementFilter = {
      page: page.value,
      per_page: perPage,
    }
    if (filterEmployeeId.value) filter.employee_id = filterEmployeeId.value
    if (filterResultType.value) filter.result_type = filterResultType.value
    if (filterDateFrom.value) filter.date_from = filterDateFrom.value
    if (filterDateTo.value) filter.date_to = filterDateTo.value

    const res = await getMeasurements(filter)
    measurements.value = res.measurements
    total.value = res.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : '取得エラー'
  } finally {
    isLoading.value = false
  }
}

function applyFilter() {
  page.value = 1
  fetchData()
}

function changePage(newPage: number) {
  page.value = newPage
  fetchData()
}

const totalPages = computed(() => Math.ceil(total.value / perPage))

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
  fetchData()
})
</script>

<template>
  <div>
    <!-- フィルタ -->
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input
          v-model="filterEmployeeId"
          type="text"
          placeholder="乗務員ID"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
        <select
          v-model="filterResultType"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全結果</option>
          <option value="normal">正常</option>
          <option value="over">基準超</option>
          <option value="error">エラー</option>
        </select>
        <input
          v-model="filterDateFrom"
          type="date"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
        <input
          v-model="filterDateTo"
          type="date"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
      </div>
      <button
        class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
        @click="applyFilter"
      >
        検索
      </button>
    </div>

    <!-- エラー -->
    <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
      {{ error }}
    </div>

    <!-- ローディング -->
    <div v-if="isLoading" class="text-center py-8 text-gray-500">
      読み込み中...
    </div>

    <!-- テーブル -->
    <div v-else-if="measurements.length > 0" class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="px-4 py-3 text-left font-medium">日時</th>
              <th class="px-4 py-3 text-left font-medium">乗務員</th>
              <th class="px-4 py-3 text-right font-medium">アルコール値</th>
              <th class="px-4 py-3 text-center font-medium">結果</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="m in measurements" :key="m.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-gray-700">{{ formatDate(m.measured_at) }}</td>
              <td class="px-4 py-3 text-gray-700">{{ employeeName(m.employee_id) }}</td>
              <td class="px-4 py-3 text-right text-gray-700">{{ m.alcohol_value.toFixed(3) }} mg/L</td>
              <td class="px-4 py-3 text-center">
                <span
                  class="inline-block px-2 py-1 rounded-full text-xs font-medium"
                  :class="resultColor(m.result_type)"
                >
                  {{ resultLabel(m.result_type) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ページネーション -->
      <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-gray-100">
        <p class="text-sm text-gray-500">
          全 {{ total }} 件中 {{ (page - 1) * perPage + 1 }}–{{ Math.min(page * perPage, total) }} 件
        </p>
        <div class="flex gap-1">
          <button
            :disabled="page <= 1"
            class="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
            @click="changePage(page - 1)"
          >
            前
          </button>
          <button
            :disabled="page >= totalPages"
            class="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
            @click="changePage(page + 1)"
          >
            次
          </button>
        </div>
      </div>
    </div>

    <!-- 空状態 -->
    <div v-else class="text-center py-8 text-gray-500">
      測定履歴がありません
    </div>
  </div>
</template>
