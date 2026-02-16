<script setup lang="ts">
import type { FaceAuthResult, MeasurementResult } from '~/types'
import { initApi } from '~/utils/api'

const config = useRuntimeConfig()
const step = ref<'nfc' | 'face_auth' | 'measuring' | 'result'>('nfc')
const employeeId = ref('')
const authResult = ref<FaceAuthResult | null>(null)
const measurementResult = ref<MeasurementResult | null>(null)
const faceSnapshot = ref<Blob | null>(null)

const saveError = ref<string | null>(null)
const isSaving = ref(false)
const saveStatus = ref<'saved' | 'queued' | null>(null)

// オフライン同期
const { isOnline, pending, isSyncing, save: offlineSave, syncQueue } = useOfflineSync()

// 認証 + API 初期化
const { accessToken, deviceTenantId, isDeviceActivated } = useAuth()
initApi(
  config.public.apiBase as string,
  () => accessToken.value,
  () => deviceTenantId.value,
)

// 手動入力フォールバック
const manualIdInput = ref('')
const useManualInput = ref(false)

// NFC 読み取り
function onNfcRead(id: string) {
  employeeId.value = id
  step.value = 'face_auth'
}

// 手動ID入力
function onManualSubmit() {
  if (manualIdInput.value.trim()) {
    employeeId.value = manualIdInput.value.trim()
    step.value = 'face_auth'
  }
}

// 顔認証結果
function onFaceAuthResult(result: FaceAuthResult) {
  authResult.value = result
  if (result.verified) {
    if (result.snapshot) {
      faceSnapshot.value = result.snapshot
    }
    step.value = 'measuring'
  }
}

// FC-1200 測定結果 → API に保存 (オフライン時はキューに退避)
async function onMeasurementResult(result: MeasurementResult) {
  measurementResult.value = result
  step.value = 'result'

  isSaving.value = true
  saveError.value = null
  saveStatus.value = null
  try {
    saveStatus.value = await offlineSave(result, faceSnapshot.value || undefined)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : '保存エラー'
    console.warn('測定結果の保存に失敗:', e)
  } finally {
    isSaving.value = false
  }
}

// リセット
function reset() {
  step.value = 'nfc'
  employeeId.value = ''
  manualIdInput.value = ''
  useManualInput.value = false
  authResult.value = null
  measurementResult.value = null
  faceSnapshot.value = null
  saveError.value = null
  saveStatus.value = null
  isSaving.value = false
}

const steps = ['NFC', '顔認証', '測定', '結果'] as const
const stepKeys = ['nfc', 'face_auth', 'measuring', 'result'] as const
const currentStepIndex = computed(() => stepKeys.indexOf(step.value))
</script>

<template>
  <div class="flex flex-col items-center min-h-screen p-4">
    <!-- 端末未アクティベート警告 -->
    <div
      v-if="!isDeviceActivated"
      class="w-full max-w-md bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-2 text-center text-sm text-red-700"
    >
      端末未登録 — <NuxtLink to="/login" class="underline font-medium">管理者ログイン</NuxtLink>で端末を登録してください
    </div>
    <!-- オフラインバナー -->
    <div
      v-if="!isOnline"
      class="w-full max-w-md bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 mb-2 text-center text-sm text-amber-700"
    >
      オフライン — 測定結果はローカルに保存されます
    </div>
    <!-- 未送信キュー通知 -->
    <div
      v-if="pending > 0 && isOnline && !isSyncing"
      class="w-full max-w-md bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 mb-2 flex items-center justify-between text-sm"
    >
      <span class="text-blue-700">未送信の測定結果: {{ pending }}件</span>
      <button class="text-blue-600 font-medium hover:underline" @click="syncQueue">同期する</button>
    </div>
    <div
      v-if="isSyncing"
      class="w-full max-w-md bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 mb-2 text-center text-sm text-blue-700"
    >
      同期中...
    </div>

    <header class="w-full max-w-md text-center py-6">
      <h1 class="text-2xl font-bold text-gray-800">アルコールチェッカー</h1>
      <!-- ステップインジケーター -->
      <div class="flex justify-center gap-2 mt-3">
        <span
          v-for="(s, i) in steps"
          :key="i"
          class="px-2 py-1 rounded-full text-xs font-medium"
          :class="{
            'bg-blue-600 text-white': i === currentStepIndex,
            'bg-gray-200 text-gray-500': i !== currentStepIndex,
          }"
        >
          {{ s }}
        </span>
      </div>
    </header>

    <main class="w-full max-w-md flex-1">
      <!-- Step 1: NFC / 手動入力 -->
      <div v-if="step === 'nfc'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">乗務員ID</h2>

          <!-- NFC モード -->
          <div v-if="!useManualInput">
            <NfcStatus @read="onNfcRead" />
            <button
              class="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
              @click="useManualInput = true"
            >
              手動でIDを入力する
            </button>
          </div>

          <!-- 手動入力モード -->
          <div v-else>
            <p class="text-sm text-gray-500 mb-4">乗務員IDを入力してください</p>
            <input
              v-model="manualIdInput"
              type="text"
              placeholder="乗務員ID (例: AABBCCDD)"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              @keyup.enter="onManualSubmit"
            >
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
      </div>

      <!-- Step 2: 顔認証 -->
      <div v-if="step === 'face_auth'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">顔認証</h2>
          <p class="text-sm text-gray-500 mb-4">ID: {{ employeeId }}</p>
          <FaceAuth
            :employee-id="employeeId"
            mode="verify"
            @result="onFaceAuthResult"
          />
        </div>
      </div>

      <!-- Step 3: FC-1200 測定 -->
      <div v-if="step === 'measuring'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">アルコール測定</h2>
          <p class="text-sm text-gray-500 mb-4">ID: {{ employeeId }}</p>
          <AlcMeasurement
            :employee-id="employeeId"
            @result="onMeasurementResult"
          />
        </div>
      </div>

      <!-- Step 4: 結果表示 -->
      <div v-if="step === 'result' && measurementResult" class="flex flex-col gap-4">
        <ResultCard
          :result="measurementResult"
          :face-photo-blob="faceSnapshot"
          @reset="reset"
        />
        <!-- API 保存状態 -->
        <div v-if="isSaving" class="text-center text-sm text-gray-500">
          保存中...
        </div>
        <div v-else-if="saveStatus === 'queued'" class="text-center text-sm text-amber-600">
          オフラインのためローカルに保存しました (オンライン復帰時に自動送信)
        </div>
        <div v-else-if="saveError" class="text-center text-sm text-red-500">
          保存失敗: {{ saveError }}
        </div>
      </div>
    </main>

    <!-- ナビゲーション -->
    <footer class="w-full max-w-md py-4">
      <div class="flex justify-center gap-4">
        <button
          v-if="step !== 'nfc'"
          class="text-gray-500 hover:text-gray-700 text-sm"
          @click="reset"
        >
          最初からやり直す
        </button>
        <NuxtLink to="/register" class="text-blue-600 hover:underline text-sm">
          顔登録
        </NuxtLink>
        <NuxtLink to="/dashboard" class="text-blue-600 hover:underline text-sm">
          管理画面
        </NuxtLink>
        <NuxtLink to="/maintenance" class="text-blue-600 hover:underline text-sm">
          メンテナンス
        </NuxtLink>
      </div>
    </footer>
  </div>
</template>
