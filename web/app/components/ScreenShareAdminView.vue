<script setup lang="ts">
const config = useRuntimeConfig()

const webRtc = useWebRtc('admin')

const allRooms = ref<string[]>([])
const selectedRoomId = ref<string | null>(null)
const isViewActive = ref(false)
const isLoading = ref(false)
const loadError = ref<string | null>(null)

const videoContainer = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)

function toggleFullscreen() {
  if (!videoContainer.value) return
  if (!document.fullscreenElement) {
    videoContainer.value.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// screen- プレフィックスのみフィルタリング
const screenRooms = computed(() => allRooms.value.filter(r => r.startsWith('screen-')))

const signalingHttpUrl = (config.public.signalingUrl as string).replace(/^wss/, 'https').replace(/^ws:/, 'http:')
const signalingWsUrl = (config.public.signalingUrl as string).replace(/^https/, 'wss').replace(/^http:/, 'ws:')

async function loadActiveRooms() {
  isLoading.value = true
  loadError.value = null
  try {
    const res = await fetch(`${signalingHttpUrl}/active-rooms`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { rooms: string[] }
    allRooms.value = data.rooms
  } catch {
    loadError.value = '画面共有一覧の取得に失敗しました'
  } finally {
    isLoading.value = false
  }
}

async function startViewing(roomId: string) {
  if (isViewActive.value) {
    webRtc.disconnect()
    isViewActive.value = false
  }

  selectedRoomId.value = roomId
  try {
    await webRtc.connect(signalingWsUrl, roomId)
    isViewActive.value = true
  } catch {
    loadError.value = '接続に失敗しました'
  }
}

function stopViewing() {
  webRtc.disconnect()
  isViewActive.value = false
  selectedRoomId.value = null
}

// WebSocket でリアルタイム更新
let watchWs: WebSocket | null = null
let watchPingTimer: ReturnType<typeof setInterval> | null = null

function connectWatchSocket() {
  const wsUrl = `${signalingWsUrl}/watch-rooms`
  watchWs = new WebSocket(wsUrl)

  watchWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'rooms_updated') {
        allRooms.value = data.rooms
        // 視聴中のルームが消えたら停止
        if (isViewActive.value && selectedRoomId.value && !data.rooms.includes(selectedRoomId.value)) {
          stopViewing()
        }
      }
    } catch { /* ignore */ }
  }

  watchWs.onopen = () => {
    watchPingTimer = setInterval(() => watchWs?.send('ping'), 30000)
  }

  watchWs.onclose = () => {
    if (watchPingTimer) { clearInterval(watchPingTimer); watchPingTimer = null }
    setTimeout(connectWatchSocket, 3000)
  }

  watchWs.onerror = () => {
    watchWs?.close()
  }
}

onMounted(() => {
  loadActiveRooms()
  connectWatchSocket()
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
})

onUnmounted(() => {
  watchWs?.close()
  watchWs = null
  if (watchPingTimer) clearInterval(watchPingTimer)
  webRtc.disconnect()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-gray-800">画面共有モニター</h2>
      <button
        class="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
        :disabled="isLoading"
        @click="loadActiveRooms"
      >
        更新
      </button>
    </div>

    <!-- 運行者側の操作手順 -->
    <div class="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
      <div class="font-semibold mb-1">運行者側の操作手順</div>
      <ol class="list-decimal list-inside space-y-0.5 text-blue-700">
        <li>運行者タブを開く</li>
        <li>画面右下の「画面共有」ボタンを押す</li>
        <li>ブラウザの画面選択ダイアログで「画面全体」を選択して共有</li>
        <li>このページの一覧に接続中の運行者が表示される</li>
      </ol>
    </div>

    <div v-if="loadError" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ loadError }}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- 左: 画面表示パネル -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-600">共有画面</h3>

        <div v-if="selectedRoomId && isViewActive" class="space-y-2">
          <!-- 接続ステータス -->
          <div class="flex items-center gap-2 text-sm">
            <span
              class="w-2 h-2 rounded-full"
              :class="webRtc.isPeerConnected.value ? 'bg-green-500 animate-pulse' : 'bg-yellow-400 animate-pulse'"
            />
            <span class="text-gray-600">
              {{ webRtc.isPeerConnected.value ? '画面受信中' : '接続待機中...' }}
            </span>
          </div>

          <!-- 画面映像 -->
          <div ref="videoContainer" class="relative group">
            <RemoteCamera :stream="webRtc.remoteStream.value" />
            <button
              class="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              :title="isFullscreen ? '全画面解除' : '全画面表示'"
              @click="toggleFullscreen"
            >
              <svg v-if="!isFullscreen" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 9V4m0 5H4m16 0h-5m5 0V4M9 15v5m0-5H4m16 0h-5m5 0v5" />
              </svg>
            </button>
          </div>

          <div class="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-xs font-mono text-blue-600 truncate">
            {{ selectedRoomId }}
          </div>

          <button
            class="w-full py-2 text-sm rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-medium transition-colors"
            @click="stopViewing"
          >
            視聴終了
          </button>
        </div>

        <div
          v-else
          class="flex items-center justify-center aspect-video rounded-xl bg-gray-100 text-gray-400 text-sm"
        >
          右のリストから共有中の画面を選択
        </div>
      </div>

      <!-- 右: 共有中一覧 -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-600">
          画面共有中
          <span class="ml-1 text-gray-400">({{ screenRooms.length }}件)</span>
        </h3>

        <div v-if="isLoading && screenRooms.length === 0" class="text-center py-8 text-gray-400 text-sm">
          読み込み中...
        </div>

        <div v-else-if="screenRooms.length === 0" class="text-center py-8 text-gray-400 text-sm">
          画面共有中の運行者はいません
        </div>

        <div
          v-for="roomId in screenRooms"
          :key="roomId"
          class="rounded-xl border p-4 cursor-pointer transition-colors"
          :class="selectedRoomId === roomId && isViewActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'"
          @click="startViewing(roomId)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span class="text-sm font-medium text-gray-800">画面共有中</span>
            </div>
            <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              共有中
            </span>
          </div>
          <div class="mt-1 text-xs text-gray-400 font-mono truncate">{{ roomId }}</div>
          <div class="mt-2 text-xs text-blue-600 font-medium">
            クリックして視聴 →
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
