<script setup lang="ts">
const config = useRuntimeConfig()

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

type TabKey = 'employees' | 'license' | 'device' | 'queue' | 'webhooks' | 'camera'
const activeTab = ref<TabKey>('employees')
const cameraActive = computed(() => activeTab.value === 'camera')
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <div class="px-4 pt-4">
      <div class="flex flex-wrap gap-1 bg-gray-200 rounded-lg p-1 w-fit">
        <button
          v-for="tab in [
            { key: 'employees', label: '乗務員' },
            { key: 'license', label: '免許証' },
            { key: 'device', label: 'デバイス' },
            { key: 'queue', label: '送信キュー' },
            { key: 'webhooks', label: 'Webhook' },
            { key: 'camera', label: 'リモートカメラ' },
          ]"
          :key="tab.key"
          class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          :class="activeTab === tab.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600 hover:text-gray-800'"
          @click="activeTab = tab.key as TabKey"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div v-if="activeTab === 'employees'">
        <EmployeeList />
      </div>

      <div v-if="activeTab === 'license'">
        <LicenseRegistration />
      </div>

      <div v-if="activeTab === 'device'">
        <DeviceManager />
      </div>

      <div v-if="activeTab === 'queue'">
        <OfflineQueue />
      </div>

      <div v-if="activeTab === 'webhooks'">
        <WebhookConfigManager />
      </div>

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
    </div>
  </div>
</template>
