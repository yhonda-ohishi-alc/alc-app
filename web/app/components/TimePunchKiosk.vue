<script setup lang="ts">
import type { ApiEmployee, TimePunchWithEmployee } from '~/types'
import { punchTimecard, listTimePunches, getEmployees } from '~/utils/api'

const props = defineProps<{
  landscape?: boolean
}>()

const nfc = useNfcWebSocket()
const { deviceId } = useAuth()
const { deviceModel } = useFingerprint()
const KYOCERA_MODELS = ['KC-T305CN', 'KC-305CN', 'KYT35', 'A404KC', 'KC-T306']
const isKyoceraTablet = computed(() => {
  if (!deviceModel.value) return false
  return KYOCERA_MODELS.some(m => deviceModel.value!.includes(m))
})
const showNfcGuide = ref(false)
const employees = ref<ApiEmployee[]>([])
const employeeMap = computed(() => {
  const map: Record<string, string> = {}
  for (const e of employees.value) map[e.id] = e.name
  return map
})

type Step = 'waiting' | 'processing' | 'done' | 'error'
const step = ref<Step>('waiting')
const result = ref<TimePunchWithEmployee | null>(null)
const errorMsg = ref('')
let resetTimer: ReturnType<typeof setTimeout> | null = null

const recentPunches = ref<{ name: string; time: string }[]>([])

const isLargeScreen = ref(false)
function updateScreenSize() {
  isLargeScreen.value = window.innerWidth >= 1024
}

const displayedPunches = computed(() => {
  const limit = isLargeScreen.value ? 20 : 10
  return recentPunches.value.slice(0, limit)
})

onMounted(async () => {
  updateScreenSize()
  window.addEventListener('resize', updateScreenSize)

  // Fetch employees + today's punches
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const [emps, res] = await Promise.all([
      getEmployees(),
      listTimePunches({ date_from: todayStart, per_page: 200 }),
    ])
    employees.value = emps
    recentPunches.value = res.punches.map(p => ({
      name: employeeMap.value[p.employee_id] || p.employee_name || p.employee_id.slice(0, 8),
      time: formatTime(p.punched_at),
    }))
  }
  catch (e) { console.error('[TimePunchKiosk] Failed to load today punches:', e) }

  nfc.connect()
  nfc.onRead(async (event) => {
    if (step.value === 'processing') return
    step.value = 'processing'
    errorMsg.value = ''

    try {
      const cardId = event.employee_id
      const res = await punchTimecard(cardId, deviceId.value)
      result.value = res
      step.value = 'done'
      recentPunches.value.unshift({
        name: res.employee_name,
        time: formatTime(res.punch.punched_at),
      })
      scheduleReset()
    }
    catch (e: any) {
      step.value = 'error'
      if (e?.message?.includes('404') || e?.status === 404) {
        errorMsg.value = 'このカードは登録されていません'
      }
      else {
        errorMsg.value = '打刻に失敗しました'
      }
      scheduleReset()
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScreenSize)
})

function scheduleReset() {
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    step.value = 'waiting'
    result.value = null
    errorMsg.value = ''
  }, 5000)
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div :class="['flex flex-col items-center justify-center gap-6', landscape ? 'p-3' : 'p-6']">
    <!-- 待機画面 -->
    <template v-if="step === 'waiting'">
      <div
        class="flex w-full gap-8"
        :class="[
          landscape ? 'max-w-4xl' : 'max-w-2xl',
          recentPunches.length
            ? (landscape ? 'flex-row items-start' : 'flex-col lg:flex-row items-center lg:items-start')
            : 'flex-col items-center'
        ]"
      >
        <!-- 左: カードアイコン + 説明 -->
        <div class="text-center flex-shrink-0">
          <div class="text-6xl mb-4">🪪</div>
          <h2 class="text-2xl font-bold text-gray-800 mb-2">タイムカード</h2>
          <p class="text-gray-500">ICカードまたは免許証をかざしてください</p>
          <button
            v-if="isKyoceraTablet"
            class="mt-2 px-3 py-1.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-200 transition-colors"
            @click="showNfcGuide = true"
          >
            NFC 位置ガイド
          </button>
          <NfcPositionGuide v-model:visible="showNfcGuide" />
          <div class="mt-4 flex items-center justify-center gap-2 text-sm">
            <span
              class="w-2 h-2 rounded-full"
              :class="nfc.isConnected.value ? 'bg-green-500' : 'bg-red-500'"
            />
            <span class="text-gray-500">
              {{ nfc.isConnected.value ? 'NFC ブリッジ接続中' : 'NFC ブリッジ未接続' }}
            </span>
          </div>
        </div>

        <!-- 右: 最近の打刻 -->
        <div v-if="recentPunches.length" class="w-full lg:max-w-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-gray-400">
                <th class="text-left py-2 px-3 font-medium">名前</th>
                <th class="text-right py-2 px-3 font-medium">時刻</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, i) in displayedPunches"
                :key="i"
                class="border-b border-gray-100"
                :class="i === 0 ? 'bg-blue-50 text-gray-800 font-medium' : 'text-gray-600'"
              >
                <td class="py-2 px-3">{{ p.name }}</td>
                <td class="py-2 px-3 text-right tabular-nums" :class="i === 0 ? 'text-blue-600' : 'text-gray-400'">{{ p.time }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 処理中 -->
    <template v-if="step === 'processing'">
      <div class="text-center">
        <div class="animate-spin text-4xl mb-4">⏳</div>
        <p class="text-gray-600">処理中...</p>
      </div>
    </template>

    <!-- 打刻完了 -->
    <template v-if="step === 'done' && result">
      <div class="text-center w-full max-w-sm">
        <div class="text-5xl mb-3">✅</div>
        <h2 class="text-2xl font-bold text-gray-800 mb-1">{{ result.employee_name }}</h2>
        <p class="text-lg text-green-600 font-medium mb-4">
          {{ formatTime(result.punch.punched_at) }} 打刻しました
        </p>

        <!-- 当日の打刻一覧 -->
        <div class="bg-gray-50 rounded-lg p-4">
          <h3 class="text-sm font-medium text-gray-500 mb-2">本日の打刻</h3>
          <div class="space-y-1">
            <div
              v-for="p in result.today_punches"
              :key="p.id"
              class="flex justify-between text-sm py-1 px-2 rounded"
              :class="p.id === result.punch.id ? 'bg-green-100 text-green-800 font-medium' : 'text-gray-700'"
            >
              <span>{{ formatTime(p.punched_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- エラー -->
    <template v-if="step === 'error'">
      <div class="text-center">
        <div class="text-5xl mb-3">❌</div>
        <p class="text-lg text-red-600 font-medium">{{ errorMsg }}</p>
      </div>
    </template>
  </div>
</template>
