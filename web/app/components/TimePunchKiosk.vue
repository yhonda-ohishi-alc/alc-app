<script setup lang="ts">
import type { ApiEmployee } from '~/types'
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

const processing = ref(false)
const errorMsg = ref('')
let errorTimer: ReturnType<typeof setTimeout> | null = null

const recentPunches = ref<{ name: string; time: string; highlighted: boolean }[]>([])

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
      highlighted: false,
    }))
  }
  catch (e) { console.error('[TimePunchKiosk] Failed to load today punches:', e) }

  nfc.connect()
  nfc.onRead(async (event) => {
    if (processing.value) return
    processing.value = true
    errorMsg.value = ''

    try {
      const cardId = event.employee_id
      const res = await punchTimecard(cardId, deviceId.value)
      const entry = { name: res.employee_name, time: formatTime(res.punch.punched_at), highlighted: true }
      recentPunches.value.unshift(entry)
      setTimeout(() => { entry.highlighted = false }, 3000)
    }
    catch (e: any) {
      if (e?.message?.includes('404') || e?.status === 404) {
        errorMsg.value = 'このカードは登録されていません'
      }
      else {
        errorMsg.value = '打刻に失敗しました'
      }
      if (errorTimer) clearTimeout(errorTimer)
      errorTimer = setTimeout(() => { errorMsg.value = '' }, 5000)
    }
    finally {
      processing.value = false
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScreenSize)
})

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div :class="['flex flex-col items-center justify-center gap-6', landscape ? 'p-3' : 'p-6']">
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
        <div class="text-6xl mb-4">
          <span v-if="processing" class="animate-spin inline-block">⏳</span>
          <span v-else>🪪</span>
        </div>
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
        <!-- インラインエラー -->
        <div
          v-if="errorMsg"
          class="mt-3 px-4 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg"
        >
          {{ errorMsg }}
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
              class="border-b border-gray-100 transition-colors duration-1000"
              :class="p.highlighted
                ? 'bg-green-100 text-green-800 font-medium'
                : (i === 0 ? 'bg-blue-50 text-gray-800 font-medium' : 'text-gray-600')"
            >
              <td class="py-2 px-3">{{ p.name }}</td>
              <td
                class="py-2 px-3 text-right tabular-nums transition-colors duration-1000"
                :class="p.highlighted ? 'text-green-700' : (i === 0 ? 'text-blue-600' : 'text-gray-400')"
              >
                {{ p.time }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
