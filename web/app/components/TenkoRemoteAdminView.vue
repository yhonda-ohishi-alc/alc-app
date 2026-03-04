<script setup lang="ts">
import type { TenkoSession } from '~/types'
import { listTenkoSessions, interruptTenkoSession, getEmployees } from '~/utils/api'

const config = useRuntimeConfig()

// 管理者側 WebRTC
const webRtc = useWebRtc('admin')
const adminCamera = useCamera()

// セッション一覧 (アクティブなセッションのみ)
const activeSessions = ref<TenkoSession[]>([])
const employeeNameMap = ref<Record<string, string>>({})
const selectedSession = ref<TenkoSession | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)

// WebRTC 接続状態
const isCallActive = ref(false)

const statusLabels: Record<string, string> = {
  identity_verified: '本人確認済',
  alcohol_testing: 'アルコール検査中',
  medical_pending: '医療データ待機',
  self_declaration_pending: '自己申告待機',
  daily_inspection_pending: '日常点検待機',
  instruction_pending: '指示確認待機',
  report_pending: '運行報告待機',
  completed: '完了',
  cancelled: 'キャンセル',
  interrupted: '中断',
}

const tenkoTypeLabels: Record<string, string> = {
  pre_operation: '業務前',
  post_operation: '業務後',
}

const ACTIVE_STATUSES = new Set([
  'identity_verified', 'alcohol_testing', 'medical_pending',
  'self_declaration_pending', 'daily_inspection_pending',
  'instruction_pending', 'report_pending', 'interrupted',
])

async function loadActiveSessions() {
  isLoading.value = true
  loadError.value = null
  try {
    const [sessRes, employees] = await Promise.all([
      listTenkoSessions({ per_page: 100 }),
      getEmployees(),
    ])
    activeSessions.value = sessRes.sessions.filter(s => ACTIVE_STATUSES.has(s.status))
    employeeNameMap.value = Object.fromEntries(employees.map(e => [e.id, e.name]))
  } catch {
    loadError.value = 'セッション一覧の取得に失敗しました'
  } finally {
    isLoading.value = false
  }
}

async function startCall(session: TenkoSession) {
  if (isCallActive.value) {
    webRtc.disconnect()
    adminCamera.stop()
    isCallActive.value = false
  }

  selectedSession.value = session
  try {
    await adminCamera.start('user')
    await webRtc.connect(config.public.signalingUrl, session.id)
    if (adminCamera.stream.value) {
      await webRtc.startStreaming(adminCamera.stream.value)
    }
    isCallActive.value = true
  } catch {
    loadError.value = 'ビデオ通話の開始に失敗しました'
  }
}

function endCall() {
  webRtc.disconnect()
  adminCamera.stop()
  isCallActive.value = false
  selectedSession.value = null
}

async function handleInterrupt() {
  if (!selectedSession.value) return
  const reason = window.prompt('中断理由を入力してください')
  if (reason === null) return
  try {
    await interruptTenkoSession(selectedSession.value.id, { reason })
    await loadActiveSessions()
  } catch {
    alert('中断に失敗しました')
  }
}

// 定期リロード (30秒)
let reloadTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadActiveSessions()
  reloadTimer = setInterval(loadActiveSessions, 30000)
})

onUnmounted(() => {
  if (reloadTimer) clearInterval(reloadTimer)
  webRtc.disconnect()
  adminCamera.stop()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-gray-800">遠隔点呼モニター</h2>
      <button
        class="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
        :disabled="isLoading"
        @click="loadActiveSessions"
      >
        更新
      </button>
    </div>

    <div v-if="loadError" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ loadError }}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- 左: ビデオ通話パネル -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-600">ビデオ通話</h3>

        <div v-if="selectedSession && isCallActive">
          <TenkoVideoCall
            :local-stream="adminCamera.stream.value"
            :remote-stream="webRtc.remoteStream.value"
            :is-peer-connected="webRtc.isPeerConnected.value"
            :is-connected="webRtc.isConnected.value"
          />

          <!-- 接続中セッション情報 -->
          <div class="mt-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
            <div class="font-semibold text-blue-800">
              {{ employeeNameMap[selectedSession.employee_id] || '不明' }}
            </div>
            <div class="text-blue-600 mt-0.5">
              {{ tenkoTypeLabels[selectedSession.tenko_type] }} /
              {{ statusLabels[selectedSession.status] || selectedSession.status }}
            </div>
          </div>

          <div class="mt-2 flex gap-2">
            <button
              class="flex-1 py-2 text-sm rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-medium transition-colors"
              @click="endCall"
            >
              通話終了
            </button>
            <button
              class="flex-1 py-2 text-sm rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 font-medium transition-colors"
              @click="handleInterrupt"
            >
              点呼を中断
            </button>
          </div>
        </div>

        <div
          v-else
          class="flex items-center justify-center aspect-video rounded-xl bg-gray-100 text-gray-400 text-sm"
        >
          右のリストからセッションを選択して通話開始
        </div>
      </div>

      <!-- 右: アクティブセッション一覧 -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-600">
          アクティブセッション
          <span class="ml-1 text-gray-400">({{ activeSessions.length }}件)</span>
        </h3>

        <div v-if="isLoading && activeSessions.length === 0" class="text-center py-8 text-gray-400 text-sm">
          読み込み中...
        </div>

        <div v-else-if="activeSessions.length === 0" class="text-center py-8 text-gray-400 text-sm">
          進行中のセッションはありません
        </div>

        <div
          v-for="session in activeSessions"
          :key="session.id"
          class="rounded-xl border p-4 cursor-pointer transition-colors"
          :class="selectedSession?.id === session.id && isCallActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'"
          @click="startCall(session)"
        >
          <div class="flex items-start justify-between">
            <div>
              <div class="font-semibold text-gray-800">
                {{ employeeNameMap[session.employee_id] || '不明' }}
              </div>
              <div class="text-xs text-gray-500 mt-0.5">
                {{ tenkoTypeLabels[session.tenko_type] }}
              </div>
            </div>
            <span
              class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="{
                'bg-yellow-100 text-yellow-700': session.status === 'interrupted',
                'bg-blue-100 text-blue-700': ['identity_verified', 'medical_pending', 'self_declaration_pending', 'daily_inspection_pending', 'instruction_pending', 'report_pending'].includes(session.status),
                'bg-red-100 text-red-700': session.status === 'alcohol_testing',
              }"
            >
              {{ statusLabels[session.status] || session.status }}
            </span>
          </div>

          <!-- アルコール結果 -->
          <div v-if="session.alcohol_result" class="mt-2 text-xs text-gray-600">
            アルコール:
            <span :class="session.alcohol_result === 'pass' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'">
              {{ session.alcohol_result === 'pass' ? '異常なし' : '検知' }}
            </span>
            <template v-if="session.alcohol_value != null">
              ({{ session.alcohol_value }} mg/L)
            </template>
          </div>

          <!-- 医療データ -->
          <div v-if="session.temperature || session.systolic" class="mt-1 text-xs text-gray-500">
            <template v-if="session.temperature">体温 {{ session.temperature }}℃</template>
            <template v-if="session.systolic">
              血圧 {{ session.systolic }}/{{ session.diastolic }} mmHg
            </template>
          </div>

          <div class="mt-2 text-xs text-blue-600 font-medium">
            クリックして通話開始 →
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
