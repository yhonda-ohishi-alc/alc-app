<script setup lang="ts">
import type { MeasurementResult } from '~/types'

const props = defineProps<{
  employeeId: string
}>()

const emit = defineEmits<{
  result: [result: MeasurementResult]
  error: [message: string]
}>()

const {
  isConnected,
  state,
  error,
  result,
  isWebSerialSupported,
  autoConnect,
  startMeasurement,
  resetSession,
} = useFc1200Serial()

const autoConnecting = ref(false)
const autoConnectFailed = ref(false)

// 接続後に測定を自動開始
watch(isConnected, (connected) => {
  if (connected) {
    startMeasurement()
  }
})

// マウント時に自動接続を試行
onMounted(async () => {
  if (!isWebSerialSupported() || isConnected.value) return
  autoConnecting.value = true
  const success = await autoConnect()
  autoConnecting.value = false
  if (!success) {
    autoConnectFailed.value = true
  }
})

// 結果を親に通知
watch(result, (val) => {
  if (val) {
    emit('result', {
      ...val,
      employeeId: props.employeeId,
    })
  }
})

// エラーを親に通知
watch(error, (val) => {
  if (val) {
    emit('error', val)
  }
})

const stateConfig = computed<{ text: string; color: string; animate: boolean }>(() => {
  switch (state.value) {
    case 'idle':
      return { text: 'FC-1200 未接続', color: 'text-gray-500', animate: false }
    case 'waiting_connection':
      return { text: '接続待機中...', color: 'text-yellow-600', animate: true }
    case 'connected':
      return { text: 'デバイス接続済み', color: 'text-blue-600', animate: false }
    case 'warming_up':
      return { text: 'ウォームアップ中...', color: 'text-yellow-600', animate: true }
    case 'blow_waiting':
      return { text: '息を吹きかけてください', color: 'text-blue-700', animate: true }
    case 'measuring':
      return { text: '測定中...', color: 'text-blue-600', animate: true }
    case 'result_received':
      return { text: '測定完了', color: 'text-green-600', animate: false }
    default:
      return { text: '不明な状態', color: 'text-gray-500', animate: false }
  }
})

function handleRetry() {
  resetSession()
  startMeasurement()
}
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <!-- WebSerial 非対応 -->
    <div v-if="!isWebSerialSupported()" class="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
      <p class="text-red-700 font-medium">WebSerial API 非対応</p>
      <p class="text-red-500 text-sm mt-1">Chrome または Edge ブラウザをご使用ください</p>
    </div>

    <template v-else>
      <!-- 自動接続中 -->
      <div v-if="!isConnected && autoConnecting" class="flex flex-col items-center gap-3">
        <span class="w-4 h-4 rounded-full bg-blue-500 animate-pulse" />
        <p class="text-blue-600 text-sm">FC-1200 に自動接続中...</p>
      </div>

      <!-- 自動接続失敗 -->
      <div v-else-if="!isConnected && autoConnectFailed" class="flex flex-col items-center gap-3">
        <p class="text-amber-700 text-sm font-medium">FC-1200 が見つかりません</p>
        <p class="text-gray-500 text-xs text-center">
          デバイスが USB 接続されていることを確認してください。
          <br>
          初回は
          <NuxtLink to="/dashboard" class="text-blue-600 hover:underline">管理画面</NuxtLink>
          からデバイスを登録してください。
        </p>
      </div>

      <!-- 測定状態表示 -->
      <div v-else class="flex flex-col items-center gap-4 w-full">
        <!-- 状態インジケーター -->
        <div class="flex items-center gap-3">
          <span
            v-if="stateConfig.animate"
            class="w-3 h-3 rounded-full bg-blue-500 animate-pulse"
          />
          <span
            v-else
            class="w-3 h-3 rounded-full"
            :class="{
              'bg-green-500': state === 'result_received',
              'bg-gray-400': state === 'idle' || state === 'connected',
            }"
          />
          <span :class="['text-lg font-medium', stateConfig.color]">
            {{ stateConfig.text }}
          </span>
        </div>

        <!-- 吹きかけプロンプト -->
        <div
          v-if="state === 'blow_waiting'"
          class="bg-blue-50 border-2 border-blue-300 rounded-2xl p-8 text-center w-full"
        >
          <p class="text-blue-800 text-xl font-bold">息を吹きかけてください</p>
          <p class="text-blue-600 text-sm mt-2">FC-1200 のセンサー部に向かって約5秒間</p>
        </div>

        <!-- エラー表示 + 再測定 -->
        <div v-if="error" class="bg-red-50 border border-red-200 rounded-xl p-4 text-center w-full">
          <p class="text-red-700">{{ error }}</p>
          <button
            class="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
            @click="handleRetry"
          >
            再測定
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
