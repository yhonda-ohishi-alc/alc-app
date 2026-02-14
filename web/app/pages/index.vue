<script setup lang="ts">
import type { FaceAuthResult } from '~/types'

const step = ref<'nfc' | 'face_auth' | 'measuring' | 'result'>('nfc')
const employeeId = ref('')
const authResult = ref<FaceAuthResult | null>(null)

// Phase 1: NFC をスキップして手動入力で代替
function onEmployeeSubmit() {
  if (employeeId.value.trim()) {
    step.value = 'face_auth'
  }
}

function onFaceAuthResult(result: FaceAuthResult) {
  authResult.value = result
  if (result.verified) {
    step.value = 'measuring'
    // Phase 3b で FC-1200 測定を統合予定
  }
}

function reset() {
  step.value = 'nfc'
  employeeId.value = ''
  authResult.value = null
}
</script>

<template>
  <div class="flex flex-col items-center min-h-screen p-4">
    <header class="w-full max-w-md text-center py-6">
      <h1 class="text-2xl font-bold text-gray-800">アルコールチェッカー</h1>
    </header>

    <main class="w-full max-w-md flex-1">
      <!-- Step 1: NFC / 乗務員ID入力 (Phase 3b で NFC に置換) -->
      <div v-if="step === 'nfc'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-700 mb-4">乗務員ID</h2>
          <p class="text-sm text-gray-500 mb-4">NFC カードをタッチするか、IDを入力してください</p>
          <input
            v-model="employeeId"
            type="text"
            placeholder="乗務員ID (例: 12345678)"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            @keyup.enter="onEmployeeSubmit"
          >
          <button
            :disabled="!employeeId.trim()"
            class="w-full mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
            @click="onEmployeeSubmit"
          >
            次へ
          </button>
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

      <!-- Step 3: 測定中 (Phase 3b で FC-1200 に置換) -->
      <div v-if="step === 'measuring'" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm text-center">
          <h2 class="text-lg font-semibold text-green-700 mb-4">認証成功</h2>
          <p class="text-gray-500">FC-1200 測定機能は Phase 3b で実装予定</p>
          <button
            class="mt-6 px-6 py-3 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors"
            @click="reset"
          >
            戻る
          </button>
        </div>
      </div>
    </main>

    <!-- ナビゲーション -->
    <footer class="w-full max-w-md py-4">
      <div class="flex justify-center gap-4">
        <NuxtLink to="/register" class="text-blue-600 hover:underline text-sm">
          顔登録
        </NuxtLink>
      </div>
    </footer>
  </div>
</template>
