<script setup lang="ts">
import type { ApiEmployee, NfcLicenseReadEvent } from '~/types'
import { getEmployees, updateEmployeeLicense, updateEmployeeNfcId } from '~/utils/api'
import {
  parseLicenseIssueDate,
  parseLicenseExpiryDate,
  formatDateForInput,
  checkLicenseExpiryFromString,
  type LicenseExpiryStatus,
} from '~/utils/license'

const employees = ref<ApiEmployee[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// 編集中の従業員
const editingId = ref<string | null>(null)
const editIssueDate = ref('')
const editExpiryDate = ref('')
const isSaving = ref(false)

// NFC 読み取り対象
const nfcTargetId = ref<string | null>(null)
const nfcCardId = ref<string | null>(null)
const { isConnected, connect, onLicenseRead } = useNfcWebSocket()

onLicenseRead((event: NfcLicenseReadEvent) => {
  if (!nfcTargetId.value || event.card_type !== 'driver_license') return

  if (event.expiry_date) {
    // 編集モードでなければ開始
    if (editingId.value !== nfcTargetId.value) {
      const emp = employees.value.find(e => e.id === nfcTargetId.value)
      if (emp) startEdit(emp)
    }
    // 発行年月日を自動入力 (hex chars 10-17)
    const issue = parseLicenseIssueDate(event.expiry_date)
    if (issue) {
      editIssueDate.value = formatDateForInput(issue)
    }
    // 有効期限を自動入力 (hex chars 18-25)
    const expiry = parseLicenseExpiryDate(event.expiry_date)
    if (expiry) {
      editExpiryDate.value = formatDateForInput(expiry)
    }
    // nfc_id 用に交付年月日+有効期限 (chars 10-25) を保持
    if (event.card_id.length >= 26) {
      nfcCardId.value = event.card_id.substring(10, 26)
    }
  }
  nfcTargetId.value = null
})

function startEdit(emp: ApiEmployee) {
  editingId.value = emp.id
  editIssueDate.value = emp.license_issue_date ?? ''
  editExpiryDate.value = emp.license_expiry_date ?? ''
  nfcTargetId.value = null
}

function cancelEdit() {
  editingId.value = null
  nfcTargetId.value = null
  nfcCardId.value = null
}

function startNfcRead(emp: ApiEmployee) {
  nfcTargetId.value = emp.id
  if (editingId.value !== emp.id) {
    startEdit(emp)
  }
}

async function handleSave() {
  if (!editingId.value) return
  isSaving.value = true
  error.value = null
  try {
    await updateEmployeeLicense(
      editingId.value,
      editIssueDate.value || null,
      editExpiryDate.value || null,
    )
    // NFC 読取で取得した card_id があれば nfc_id も更新
    if (nfcCardId.value) {
      await updateEmployeeNfcId(editingId.value, nfcCardId.value)
      nfcCardId.value = null
    }
    editingId.value = null
    await fetchData()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存エラー'
  } finally {
    isSaving.value = false
  }
}

function licenseStatus(emp: ApiEmployee): LicenseExpiryStatus | null {
  if (!emp.license_expiry_date) return null
  return checkLicenseExpiryFromString(emp.license_expiry_date)
}

const registeredCount = computed(() =>
  employees.value.filter(e => e.license_expiry_date).length
)

const expiredCount = computed(() =>
  employees.value.filter(e => licenseStatus(e) === 'expired').length
)

const expiringSoonCount = computed(() =>
  employees.value.filter(e => licenseStatus(e) === 'expiring_soon').length
)

async function fetchData() {
  isLoading.value = true
  error.value = null
  try {
    employees.value = await getEmployees()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '取得エラー'
  } finally {
    isLoading.value = false
  }
}

function statusLabel(status: LicenseExpiryStatus | null): string {
  switch (status) {
    case 'valid': return '有効'
    case 'expiring_soon': return '期限間近'
    case 'expired': return '期限切れ'
    default: return '未登録'
  }
}

function statusClass(status: LicenseExpiryStatus | null): string {
  switch (status) {
    case 'valid': return 'bg-green-100 text-green-800'
    case 'expiring_soon': return 'bg-amber-100 text-amber-800'
    case 'expired': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-500'
  }
}

onMounted(() => {
  connect()
  fetchData()
})
</script>

<template>
  <div>
    <!-- サマリ -->
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <div class="flex items-center gap-6 text-sm text-gray-600">
        <span>乗務員数: <strong class="text-gray-800">{{ employees.length }}</strong> 名</span>
        <span>免許登録済: <strong class="text-green-700">{{ registeredCount }}</strong></span>
        <span v-if="expiredCount > 0" class="text-red-700">期限切れ: <strong>{{ expiredCount }}</strong></span>
        <span v-if="expiringSoonCount > 0" class="text-amber-700">期限間近: <strong>{{ expiringSoonCount }}</strong></span>
        <div class="ml-auto flex items-center gap-3">
          <span class="flex items-center gap-1 text-xs">
            <span
              class="w-2 h-2 rounded-full"
              :class="isConnected ? 'bg-green-500' : 'bg-gray-300'"
            />
            NFC {{ isConnected ? '接続中' : '未接続' }}
          </span>
          <button
            class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            @click="fetchData"
          >
            更新
          </button>
        </div>
      </div>
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
    <div v-else-if="employees.length > 0" class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="px-4 py-3 text-left font-medium">社員番号</th>
              <th class="px-4 py-3 text-left font-medium">名前</th>
              <th class="px-4 py-3 text-left font-medium">NFC ID</th>
              <th class="px-4 py-3 text-center font-medium">発行年月日</th>
              <th class="px-4 py-3 text-center font-medium">有効期限</th>
              <th class="px-4 py-3 text-center font-medium">ステータス</th>
              <th class="px-4 py-3 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="emp in employees" :key="emp.id" class="hover:bg-gray-50">
              <!-- 編集モード -->
              <template v-if="editingId === emp.id">
                <td class="px-4 py-3 text-gray-800 font-mono">{{ emp.code || '-' }}</td>
                <td class="px-4 py-3 text-gray-800 font-medium">{{ emp.name }}</td>
                <td class="px-4 py-3 text-gray-500 font-mono text-xs">{{ nfcCardId || emp.nfc_id || '-' }}</td>
                <td class="px-4 py-3 text-center">
                  <input
                    v-model="editIssueDate"
                    type="date"
                    class="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex items-center justify-center gap-1">
                    <input
                      v-model="editExpiryDate"
                      type="date"
                      class="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                    <span
                      v-if="nfcTargetId === emp.id"
                      class="text-xs text-blue-600 whitespace-nowrap animate-pulse"
                    >
                      カードをタッチ...
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3 text-center">
                  <span
                    class="inline-block px-2 py-1 rounded-full text-xs font-medium"
                    :class="statusClass(licenseStatus(emp))"
                  >
                    {{ statusLabel(licenseStatus(emp)) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex justify-center gap-1">
                    <button
                      :disabled="isSaving"
                      class="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                      @click="handleSave"
                    >
                      {{ isSaving ? '保存中...' : '保存' }}
                    </button>
                    <button
                      v-if="isConnected"
                      class="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs"
                      @click="startNfcRead(emp)"
                    >
                      NFC読取
                    </button>
                    <button
                      class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                      @click="cancelEdit"
                    >
                      取消
                    </button>
                  </div>
                </td>
              </template>

              <!-- 通常表示 -->
              <template v-else>
                <td class="px-4 py-3 text-gray-800 font-mono">{{ emp.code || '-' }}</td>
                <td class="px-4 py-3 text-gray-800 font-medium">{{ emp.name }}</td>
                <td class="px-4 py-3 text-gray-500 font-mono text-xs">{{ emp.nfc_id || '-' }}</td>
                <td class="px-4 py-3 text-center text-gray-600">{{ emp.license_issue_date || '-' }}</td>
                <td class="px-4 py-3 text-center text-gray-600">{{ emp.license_expiry_date || '-' }}</td>
                <td class="px-4 py-3 text-center">
                  <span
                    class="inline-block px-2 py-1 rounded-full text-xs font-medium"
                    :class="statusClass(licenseStatus(emp))"
                  >
                    {{ statusLabel(licenseStatus(emp)) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-center">
                  <div class="flex justify-center gap-1">
                    <button
                      class="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs"
                      @click="startEdit(emp)"
                    >
                      {{ emp.license_expiry_date ? '編集' : '登録' }}
                    </button>
                    <button
                      v-if="isConnected"
                      class="px-2 py-1 text-green-600 hover:bg-green-50 rounded text-xs"
                      @click="startNfcRead(emp)"
                    >
                      NFC読取
                    </button>
                  </div>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 空状態 -->
    <div v-else class="text-center py-8 text-gray-500">
      乗務員が登録されていません
    </div>
  </div>
</template>
