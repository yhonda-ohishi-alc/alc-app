<script setup lang="ts">
import type { FaceAuthResult } from '~/types'
import { getEmployeeByNfcId, getEmployeeByCode } from '~/utils/api'

const props = defineProps<{
  requiredRole: 'manager' | 'admin'
}>()

const { isAuthenticated } = useAuth()

// 認証状態
const authState = ref<'pending' | 'authenticated' | 'denied'>('pending')
const authenticatedEmployee = ref<{ id: string; name: string; role: string } | null>(null)
const errorMessage = ref<string | null>(null)

// NFC / 手動入力
const employeeId = ref('')
const employeeName = ref('')
const manualIdInput = ref('')
const useManualInput = ref(false)
const manualError = ref<string | null>(null)
const step = ref<'nfc' | 'face_auth'>('nfc')

// Google ログイン済み → 全パス
watch(isAuthenticated, (val) => {
  if (val) authState.value = 'authenticated'
}, { immediate: true })

// sessionStorage でセッション間の認証状態を維持
const storageKey = computed(() => `role_auth_${props.requiredRole}`)
onMounted(() => {
  if (authState.value === 'authenticated') return
  const stored = sessionStorage.getItem(storageKey.value)
  if (stored) {
    try {
      const data = JSON.parse(stored)
      authenticatedEmployee.value = data
      authState.value = 'authenticated'
    } catch { /* ignore */ }
  }
})

// ロール階層チェック
function hasRole(employeeRole: string): boolean {
  if (props.requiredRole === 'manager') {
    return employeeRole === 'manager' || employeeRole === 'admin'
  }
  return employeeRole === 'admin'
}

const roleLabel: Record<string, string> = {
  manager: '運行管理者',
  admin: 'システム管理者',
}

// NFC 読み取り
async function onNfcRead(nfcId: string) {
  errorMessage.value = null
  try {
    const emp = await getEmployeeByNfcId(nfcId)
    employeeId.value = emp.id
    employeeName.value = emp.name
    if (!hasRole(emp.role)) {
      errorMessage.value = `${emp.name}さんには${roleLabel[props.requiredRole]}の権限がありません (現在のロール: ${emp.role})`
      return
    }
    authenticatedEmployee.value = { id: emp.id, name: emp.name, role: emp.role }
    step.value = 'face_auth'
  } catch {
    errorMessage.value = `乗務員が見つかりません (NFC ID: ${nfcId})`
  }
}

// 手動入力
async function onManualSubmit() {
  const input = manualIdInput.value.trim()
  if (!input) return
  manualError.value = null
  errorMessage.value = null
  try {
    const emp = await getEmployeeByCode(input)
    employeeId.value = emp.id
    employeeName.value = emp.name
    if (!hasRole(emp.role)) {
      errorMessage.value = `${emp.name}さんには${roleLabel[props.requiredRole]}の権限がありません (現在のロール: ${emp.role})`
      return
    }
    authenticatedEmployee.value = { id: emp.id, name: emp.name, role: emp.role }
    step.value = 'face_auth'
  } catch {
    manualError.value = `社員番号「${input}」の乗務員が見つかりません`
  }
}

// 顔認証完了
function onFaceAuthResult(result: FaceAuthResult) {
  if (result.verified) {
    authState.value = 'authenticated'
    sessionStorage.setItem(storageKey.value, JSON.stringify(authenticatedEmployee.value))
  } else {
    errorMessage.value = '顔認証に失敗しました。もう一度お試しください。'
    step.value = 'nfc'
  }
}

// リセット
function resetAuth() {
  authState.value = 'pending'
  authenticatedEmployee.value = null
  errorMessage.value = null
  employeeId.value = ''
  employeeName.value = ''
  manualIdInput.value = ''
  manualError.value = null
  useManualInput.value = false
  step.value = 'nfc'
  sessionStorage.removeItem(storageKey.value)
}
</script>

<template>
  <!-- 認証済み → slot 表示 -->
  <div v-if="authState === 'authenticated'" class="flex flex-col flex-1">
    <!-- 認証者バナー -->
    <div v-if="authenticatedEmployee" class="bg-green-50 border-b border-green-200 px-4 py-1.5 text-center text-xs text-green-700">
      {{ authenticatedEmployee.name }} ({{ roleLabel[requiredRole] }}) としてログイン中
      <button class="ml-2 underline hover:text-green-900" @click="resetAuth">ログアウト</button>
    </div>
    <slot />
  </div>

  <!-- 未認証 → 認証ゲート -->
  <div v-else class="flex flex-col items-center w-full flex-1 overflow-y-auto p-4">
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl p-6 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-700 mb-2">{{ roleLabel[requiredRole] }}認証</h2>
        <p class="text-sm text-gray-500 mb-4">
          {{ roleLabel[requiredRole] }}機能にアクセスするには、ID + 顔認証が必要です。
        </p>

        <!-- エラー -->
        <div v-if="errorMessage" class="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          {{ errorMessage }}
        </div>

        <!-- Step 1: NFC / 手動入力 -->
        <div v-if="step === 'nfc'">
          <div v-if="!useManualInput">
            <NfcStatus @read="onNfcRead" />
            <button
              class="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
              @click="useManualInput = true"
            >
              手動でIDを入力する
            </button>
          </div>
          <div v-else>
            <p class="text-sm text-gray-500 mb-4">社員番号を入力してください</p>
            <input
              v-model="manualIdInput"
              type="text"
              placeholder="社員番号 (例: 001)"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              @keyup.enter="onManualSubmit"
            >
            <p v-if="manualError" class="mt-2 text-sm text-red-600">{{ manualError }}</p>
            <button
              :disabled="!manualIdInput.trim()"
              class="w-full mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
              @click="onManualSubmit"
            >
              次へ
            </button>
            <button
              class="w-full mt-2 text-sm text-gray-500 hover:text-gray-700 underline"
              @click="useManualInput = false"
            >
              NFC で読み取る
            </button>
          </div>
        </div>

        <!-- Step 2: 顔認証 -->
        <div v-if="step === 'face_auth'">
          <p class="text-sm text-gray-500 mb-4">{{ employeeName }}</p>
          <FaceAuth
            :employee-id="employeeId"
            mode="verify"
            @result="onFaceAuthResult"
          />
          <button
            class="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
            @click="step = 'nfc'"
          >
            戻る
          </button>
        </div>

        <!-- Google ログインリンク -->
        <div class="mt-6 pt-4 border-t border-gray-200 text-center">
          <NuxtLink to="/login" class="text-blue-600 hover:underline text-sm">
            Google アカウントでログイン
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
