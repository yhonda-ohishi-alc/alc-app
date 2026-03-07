<script setup lang="ts">
import type { TimePunchWithEmployee } from '~/types'
import { punchTimecard, listTimePunches } from '~/utils/api'

const nfc = useNfcWebSocket()
const { deviceId } = useAuth()

type Step = 'waiting' | 'processing' | 'done' | 'error'
const step = ref<Step>('waiting')
const result = ref<TimePunchWithEmployee | null>(null)
const errorMsg = ref('')
let resetTimer: ReturnType<typeof setTimeout> | null = null

const recentPunchers = ref<{ name: string; time: string }[]>([])

const isLargeScreen = ref(false)
function updateScreenSize() {
  isLargeScreen.value = window.innerWidth >= 1024
}

const displayedPunchers = computed(() => {
  const limit = isLargeScreen.value ? 10 : 5
  return recentPunchers.value.slice(0, limit)
})

function updateRecentPunchers(name: string, punchedAt: string) {
  const time = formatTime(punchedAt)
  const idx = recentPunchers.value.findIndex(p => p.name === name)
  if (idx >= 0) recentPunchers.value.splice(idx, 1)
  recentPunchers.value.unshift({ name, time })
  if (recentPunchers.value.length > 10) recentPunchers.value.length = 10
}

onMounted(async () => {
  updateScreenSize()
  window.addEventListener('resize', updateScreenSize)

  // Fetch today's punches
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const res = await listTimePunches({ date_from: todayStart, per_page: 20 })
    // Group by employee_name, keep latest per person
    const byName = new Map<string, string>()
    for (const p of res.punches) {
      const name = p.employee_name
      if (!name) continue
      if (!byName.has(name)) byName.set(name, p.punched_at)
    }
    // punches are DESC, so first occurrence per name is latest
    recentPunchers.value = Array.from(byName.entries()).map(([name, punchedAt]) => ({
      name,
      time: formatTime(punchedAt),
    }))
  }
  catch { /* ignore fetch errors on mount */ }

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
      updateRecentPunchers(res.employee_name, res.punch.punched_at)
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
  <div class="flex flex-col items-center justify-center p-6 gap-6">
    <!-- 待機画面 -->
    <template v-if="step === 'waiting'">
      <div
        class="flex w-full max-w-2xl gap-8"
        :class="recentPunchers.length ? 'flex-col lg:flex-row items-center lg:items-start' : 'flex-col items-center'"
      >
        <!-- 左: カードアイコン + 説明 -->
        <div class="text-center flex-shrink-0">
          <div class="text-6xl mb-4">🪪</div>
          <h2 class="text-2xl font-bold text-gray-800 mb-2">タイムカード</h2>
          <p class="text-gray-500">ICカードまたは免許証をかざしてください</p>
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
        <div v-if="recentPunchers.length" class="w-full lg:max-w-sm">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-gray-400">
                <th class="text-left py-2 px-3 font-medium">名前</th>
                <th class="text-right py-2 px-3 font-medium">時刻</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, i) in displayedPunchers"
                :key="p.name"
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
