<script setup lang="ts">
import { initApi } from '~/utils/api'

const config = useRuntimeConfig()

// 認証 + API 初期化
const { accessToken, deviceTenantId, user, isLoading, isAuthenticated, logout: authLogout, refreshAccessToken } = useAuth()
initApi(
  config.public.apiBase as string,
  () => accessToken.value,
  () => deviceTenantId.value,
  () => refreshAccessToken(),
)

// WebRTC (admin として接続)
const { isConnected, isPeerConnected, remoteStream, error: rtcError, connect, disconnect } = useWebRtc('admin')

const roomId = ref('')
const isRtcActive = ref(false)

async function connectRtc() {
  if (!roomId.value.trim()) return
  const signalingUrl = (config.public.signalingUrl as string).replace(/^http/, 'ws')
  await connect(signalingUrl, roomId.value.trim())
  isRtcActive.value = true
}

function disconnectRtc() {
  disconnect()
  isRtcActive.value = false
}

// 顔データ同期 (ローカル ↔ サーバー)
useFaceSync()

// タブ管理
type TabKey = 'history' | 'camera' | 'queue' | 'employees' | 'license' | 'device'
  | 'tenko' | 'schedules' | 'records' | 'webhooks' | 'baselines' | 'failures'
const activeTab = ref<TabKey>('history')
const cameraActive = computed(() => activeTab.value === 'camera')
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-white shadow-sm">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-800">管理者ダッシュボード</h1>
        <div class="flex items-center gap-4">
          <span v-if="user" class="text-sm text-gray-500">{{ user.email }}</span>
          <button
            class="text-sm text-red-600 hover:underline"
            @click="authLogout().then(() => navigateTo('/login'))"
          >
            ログアウト
          </button>
          <NuxtLink to="/register" class="text-blue-600 hover:underline text-sm">
            顔登録
          </NuxtLink>
          <NuxtLink to="/?tab=tenko" class="text-blue-600 hover:underline text-sm">
            点呼キオスク
          </NuxtLink>
          <NuxtLink to="/" class="text-blue-600 hover:underline text-sm">
            測定画面へ
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- 認証初期化待ち -->
    <div v-if="isLoading" class="max-w-6xl mx-auto px-4 py-12 text-center text-gray-500">
      読み込み中...
    </div>

    <main v-else class="max-w-6xl mx-auto px-4 py-6">
      <!-- タブ: 基本 -->
      <div class="flex flex-wrap gap-1 mb-2 bg-gray-200 rounded-lg p-1 w-fit">
        <button v-for="tab in [
          { key: 'history', label: '測定履歴' },
          { key: 'camera', label: 'リモートカメラ' },
          { key: 'queue', label: '送信キュー' },
          { key: 'employees', label: '乗務員' },
          { key: 'license', label: '免許証' },
          { key: 'device', label: 'デバイス' },
        ]" :key="tab.key"
          class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          :class="activeTab === tab.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600 hover:text-gray-800'"
          @click="activeTab = tab.key as TabKey"
        >{{ tab.label }}</button>
      </div>
      <!-- タブ: 点呼管理 -->
      <div class="flex flex-wrap gap-1 mb-6 bg-blue-100 rounded-lg p-1 w-fit">
        <button v-for="tab in [
          { key: 'tenko', label: '点呼' },
          { key: 'schedules', label: '予定管理' },
          { key: 'records', label: '点呼記録' },
          { key: 'baselines', label: '健康基準' },
          { key: 'failures', label: '故障記録' },
          { key: 'webhooks', label: 'Webhook' },
        ]" :key="tab.key"
          class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          :class="activeTab === tab.key ? 'bg-white text-blue-800 shadow-sm' : 'text-blue-700 hover:text-blue-900'"
          @click="activeTab = tab.key as TabKey"
        >{{ tab.label }}</button>
      </div>

      <!-- 測定履歴タブ -->
      <div v-if="activeTab === 'history'">
        <MeasurementHistory />
      </div>

      <!-- リモートカメラタブ -->
      <div v-if="activeTab === 'camera'" class="space-y-4">
        <!-- 接続コントロール -->
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <div class="flex items-center gap-3">
            <input
              v-model="roomId"
              type="text"
              placeholder="ルームID"
              :disabled="isRtcActive"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
            <button
              v-if="!isRtcActive"
              :disabled="!roomId.trim()"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
              @click="connectRtc"
            >
              接続
            </button>
            <button
              v-else
              class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
              @click="disconnectRtc"
            >
              切断
            </button>
          </div>

          <!-- 接続状態 -->
          <div class="flex items-center gap-4 mt-3 text-xs">
            <span class="flex items-center gap-1">
              <span
                class="w-2 h-2 rounded-full"
                :class="isConnected ? 'bg-green-500' : 'bg-gray-300'"
              />
              シグナリング {{ isConnected ? '接続中' : '未接続' }}
            </span>
            <span class="flex items-center gap-1">
              <span
                class="w-2 h-2 rounded-full"
                :class="isPeerConnected ? 'bg-green-500' : 'bg-gray-300'"
              />
              測定端末 {{ isPeerConnected ? '接続中' : '未接続' }}
            </span>
          </div>

          <p v-if="rtcError" class="mt-2 text-xs text-red-600">{{ rtcError }}</p>
        </div>

        <!-- ローカルカメラ -->
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <h3 class="text-sm font-medium text-gray-700 mb-2">ローカルカメラ</h3>
          <CameraPreview :active="cameraActive" />
        </div>

        <!-- リモートカメラ映像 -->
        <div class="bg-white rounded-xl p-4 shadow-sm">
          <h3 class="text-sm font-medium text-gray-700 mb-2">リモートカメラ</h3>
          <RemoteCamera :stream="remoteStream" />
        </div>
      </div>

      <!-- 送信キュータブ -->
      <div v-if="activeTab === 'queue'">
        <OfflineQueue />
      </div>

      <!-- 乗務員タブ -->
      <div v-if="activeTab === 'employees'">
        <EmployeeList />
      </div>

      <!-- 免許証タブ -->
      <div v-if="activeTab === 'license'">
        <LicenseRegistration />
      </div>

      <!-- デバイスタブ -->
      <div v-if="activeTab === 'device'">
        <DeviceManager />
      </div>

      <!-- 点呼タブ (サマリ + セッション監視) -->
      <div v-if="activeTab === 'tenko'" class="space-y-4">
        <TenkoDashboardSummary />
        <h2 class="text-sm font-medium text-gray-700">進行中セッション</h2>
        <TenkoSessionMonitor />
      </div>

      <!-- 予定管理タブ -->
      <div v-if="activeTab === 'schedules'">
        <TenkoScheduleManager />
      </div>

      <!-- 点呼記録タブ -->
      <div v-if="activeTab === 'records'">
        <TenkoRecordViewer />
      </div>

      <!-- 健康基準タブ -->
      <div v-if="activeTab === 'baselines'">
        <HealthBaselineManager />
      </div>

      <!-- 故障記録タブ -->
      <div v-if="activeTab === 'failures'">
        <EquipmentFailureManager />
      </div>

      <!-- Webhookタブ -->
      <div v-if="activeTab === 'webhooks'">
        <WebhookConfigManager />
      </div>
    </main>
  </div>
</template>
