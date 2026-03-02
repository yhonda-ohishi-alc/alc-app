<script setup lang="ts">
import type { FaceAuthResult, MeasurementResult, SubmitMedicalData } from '~/types'
import { getEmployeeByNfcId, getEmployeeByCode } from '~/utils/api'

// シングルトン再呼出で共有状態取得
const { isDeviceActivated } = useAuth()
const { isSyncing: isFaceSyncing } = useFaceSync()

// 点呼キオスク状態管理
const {
  step, employeeId, employeeName, pendingSchedules, selectedSchedule, session,
  error, isLoading, safetyJudgment, tenkoType, isPreOperation,
  stepLabels, currentStepIndex,
  identifyEmployee, selectSchedule, onFaceAuthComplete,
  onAlcoholResult, onMedicalSubmit, onSelfDeclarationSubmit,
  onDailyInspectionSubmit, onInstructionConfirm, onReportSubmit,
  reset,
} = useTenkoKiosk()

// BLE Medical Gateway (体温・血圧)
const {
  latestTemperature: bleTemperature,
  latestBloodPressure: bleBloodPressure,
} = useBleGateway()

// --- NFC / 手動入力 ---
const manualIdInput = ref('')
const useManualInput = ref(false)
const manualError = ref<string | null>(null)

async function onNfcRead(nfcId: string) {
  try {
    const emp = await getEmployeeByNfcId(nfcId)
    await identifyEmployee(emp.id, emp.name)
  } catch {
    error.value = `乗務員が見つかりません (NFC ID: ${nfcId})`
  }
}

async function onManualSubmit() {
  const input = manualIdInput.value.trim()
  if (!input) return
  manualError.value = null
  try {
    const emp = await getEmployeeByCode(input)
    await identifyEmployee(emp.id, emp.name)
  } catch {
    manualError.value = `社員番号「${input}」の乗務員が見つかりません`
  }
}

// --- 顔認証結果 ---
function onFaceAuthResult(result: FaceAuthResult) {
  if (result.verified) {
    onFaceAuthComplete(result)
  }
}

// --- アルコール測定結果 ---
function onMeasurementResult(result: MeasurementResult) {
  const alcoholResult = result.resultType === 'normal' ? 'pass' : 'fail'
  onAlcoholResult(alcoholResult, result.alcoholValue)
}

// --- BLE 医療データ → 送信 ---
function onMedicalNext() {
  const data: SubmitMedicalData = {}
  if (bleTemperature.value) {
    data.temperature = bleTemperature.value.value
    data.medical_measured_at = bleTemperature.value.measuredAt.toISOString()
  }
  if (bleBloodPressure.value) {
    data.systolic = bleBloodPressure.value.systolic
    data.diastolic = bleBloodPressure.value.diastolic
    data.pulse = bleBloodPressure.value.pulse
    if (!data.medical_measured_at) {
      data.medical_measured_at = bleBloodPressure.value.measuredAt.toISOString()
    }
  }
  onMedicalSubmit(data)
}

function onMedicalSkip() {
  // 医療データなしで送信
  onMedicalSubmit({})
}

// --- リセット時に手動入力もクリア ---
function handleReset() {
  reset()
  manualIdInput.value = ''
  manualError.value = null
  useManualInput.value = false
}
</script>

<template>
  <div class="flex flex-col items-center w-full flex-1 overflow-y-auto p-4">
    <!-- 端末未アクティベート警告 -->
    <ClientOnly>
      <div
        v-if="!isDeviceActivated"
        class="w-full max-w-md bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-2 text-center text-sm text-red-700"
      >
        端末未登録 — <NuxtLink to="/login" class="underline font-medium">管理者ログイン</NuxtLink>で端末を登録してください
      </div>
    </ClientOnly>

    <!-- 顔データ同期中 -->
    <div
      v-if="isFaceSyncing"
      class="w-full max-w-md bg-green-50 border border-green-200 rounded-xl px-4 py-2 mb-2 text-center text-sm text-green-700"
    >
      顔データ同期中...
    </div>

    <header class="w-full max-w-md text-center py-6">
      <h1 class="text-2xl font-bold text-gray-800">自動点呼</h1>
      <p v-if="tenkoType" class="mt-1 text-sm">
        <span
          class="px-2 py-0.5 rounded text-xs font-bold"
          :class="isPreOperation ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'"
        >
          {{ isPreOperation ? '業務前' : '業務後' }}
        </span>
      </p>

      <!-- ステップインジケーター -->
      <div v-if="step !== 'nfc'" class="flex items-center justify-center mt-3 flex-wrap gap-y-1">
        <template v-for="(s, i) in stepLabels" :key="i">
          <div
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            :class="{
              'bg-blue-600 text-white': i === currentStepIndex,
              'bg-green-500 text-white': i < currentStepIndex,
              'bg-gray-200 text-gray-400': i > currentStepIndex,
            }"
          >
            <svg v-if="i < currentStepIndex" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {{ s }}
          </div>
          <svg
            v-if="i < stepLabels.length - 1"
            class="w-4 h-4 mx-1 shrink-0"
            :class="i < currentStepIndex ? 'text-green-400' : 'text-gray-300'"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </template>
      </div>
    </header>

    <main class="w-full max-w-md flex-1">
      <!-- グローバルエラー -->
      <div v-if="error" class="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
        {{ error }}
      </div>

      <!-- ローディング -->
      <div v-if="isLoading" class="flex justify-center py-8">
        <span class="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>

      <!-- Step 1: NFC / 手動入力 -->
      <div v-else-if="step === 'nfc'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">乗務員ID</h2>

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
      </div>

      <!-- Step 2: スケジュール選択 -->
      <div v-else-if="step === 'schedule_select'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">点呼予定選択</h2>
          <TenkoScheduleSelect
            :schedules="pendingSchedules"
            :employee-name="employeeName"
            @select="selectSchedule"
          />
        </div>
      </div>

      <!-- Step 3: 顔認証 -->
      <div v-else-if="step === 'face_auth'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">顔認証</h2>
          <p class="text-sm text-gray-500 mb-4">{{ employeeName }}</p>
          <FaceAuth
            :employee-id="employeeId"
            mode="verify"
            @result="onFaceAuthResult"
          />
        </div>
      </div>

      <!-- Step 4: アルコール測定 -->
      <div v-else-if="step === 'alcohol'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">アルコール測定</h2>
          <p class="text-sm text-gray-500 mb-4">{{ employeeName }}</p>
          <AlcMeasurement
            :employee-id="employeeId"
            @result="onMeasurementResult"
          />
        </div>
      </div>

      <!-- Step 5: 体温・血圧 (業務前のみ) -->
      <div v-else-if="step === 'medical'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">体温・血圧</h2>
          <p class="text-sm text-gray-500 mb-4">{{ employeeName }}</p>
          <BleStatus
            @next="onMedicalNext"
            @skip="onMedicalSkip"
          />
        </div>
      </div>

      <!-- Step 6: 自己申告 (業務前のみ) -->
      <div v-else-if="step === 'self_declaration'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">自己申告</h2>
          <p class="text-sm text-gray-500 mb-4">{{ employeeName }}</p>
          <TenkoSelfDeclaration @submit="onSelfDeclarationSubmit" />
        </div>
      </div>

      <!-- Step 7: 日常点検 (業務前のみ) -->
      <div v-else-if="step === 'daily_inspection'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">日常点検</h2>
          <p class="text-sm text-gray-500 mb-4">{{ employeeName }}</p>
          <TenkoDailyInspection @submit="onDailyInspectionSubmit" />
        </div>
      </div>

      <!-- Step 8: 指示確認 -->
      <div v-else-if="step === 'instruction'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">指示事項</h2>
          <p class="text-sm text-gray-500 mb-4">{{ employeeName }}</p>
          <TenkoInstruction
            :instruction="selectedSchedule?.instruction ?? null"
            :manager-name="selectedSchedule?.responsible_manager_name ?? ''"
            @confirm="onInstructionConfirm"
          />
        </div>
      </div>

      <!-- Step 9: 運行報告 (業務後のみ) -->
      <div v-else-if="step === 'report'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">運行報告</h2>
          <p class="text-sm text-gray-500 mb-4">{{ employeeName }}</p>
          <TenkoOperationReport @submit="onReportSubmit" />
        </div>
      </div>

      <!-- 完了 -->
      <div v-else-if="step === 'completed' && session" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <TenkoCompleted
            :session="session"
            :employee-name="employeeName"
            @reset="handleReset"
          />
        </div>
      </div>

      <!-- 中断 (安全判定失敗 etc.) -->
      <div v-else-if="step === 'interrupted'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <TenkoInterrupted
            :employee-name="employeeName"
            :safety-judgment="safetyJudgment"
            @reset="handleReset"
          />
        </div>
      </div>

      <!-- キャンセル (アルコール検知 / 日常点検NG) -->
      <div v-else-if="step === 'cancelled'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <TenkoInterrupted
            :employee-name="employeeName"
            :reason="session?.cancel_reason ?? '点呼がキャンセルされました'"
            @reset="handleReset"
          />
        </div>
      </div>
    </main>

    <!-- ナビゲーション -->
    <footer class="w-full max-w-md py-4">
      <div class="flex justify-center gap-4">
        <button
          v-if="step !== 'nfc'"
          class="text-gray-500 hover:text-gray-700 text-sm"
          @click="handleReset"
        >
          最初からやり直す
        </button>
      </div>
    </footer>
  </div>
</template>
