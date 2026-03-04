<script setup lang="ts">
const config = useRuntimeConfig()

// 管理者側 WebRTC
const webRtc = useWebRtc('admin')
const adminCamera = useCamera()
let adminAudioStream: MediaStream | null = null  // マイク音声 (WebRTC用)
const adminCombinedStream = ref<MediaStream | null>(null)  // 映像+音声 (TenkoVideoCall用)

// シグナリングサーバーからアクティブなルーム(device接続中)一覧を取得
const activeRooms = ref<string[]>([])
const selectedRoomId = ref<string | null>(null)
const isCallActive = ref(false)
const isLoading = ref(false)
const loadError = ref<string | null>(null)

// HTTP用: wss://→https:// または ws://→http://
const signalingHttpUrl = (config.public.signalingUrl as string).replace(/^wss/, 'https').replace(/^ws:/, 'http:')
// WebSocket用: https://→wss:// または http://→ws://
const signalingWsUrl = (config.public.signalingUrl as string).replace(/^https/, 'wss').replace(/^http:/, 'ws:')

async function loadActiveRooms() {
  isLoading.value = true
  loadError.value = null
  try {
    const res = await fetch(`${signalingHttpUrl}/active-rooms`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { rooms: string[] }
    activeRooms.value = data.rooms
  } catch {
    loadError.value = '接続中デバイスの取得に失敗しました'
  } finally {
    isLoading.value = false
  }
}

async function startCall(roomId: string) {
  if (isCallActive.value) {
    webRtc.disconnect()
    adminCamera.stop()
    adminAudioStream?.getTracks().forEach(t => t.stop())
    adminAudioStream = null
    isCallActive.value = false
  }

  selectedRoomId.value = roomId
  try {
    await adminCamera.start('user')
    // カメラ映像 + マイク音声を合成して送信
    let streamToSend = adminCamera.stream.value
    try {
      adminAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (streamToSend) {
        streamToSend = new MediaStream([
          ...streamToSend.getVideoTracks(),
          ...adminAudioStream.getAudioTracks(),
        ])
      }
    }
    catch {
      // マイク拒否時はビデオのみで続行
    }
    adminCombinedStream.value = streamToSend
    await webRtc.connect(signalingWsUrl, roomId)
    if (streamToSend) {
      await webRtc.startStreaming(streamToSend)
    }
    isCallActive.value = true
  }
  catch {
    loadError.value = 'ビデオ通話の開始に失敗しました'
  }
}

function endCall() {
  webRtc.disconnect()
  adminCamera.stop()
  adminAudioStream?.getTracks().forEach(t => t.stop())
  adminAudioStream = null
  adminCombinedStream.value = null
  isCallActive.value = false
  selectedRoomId.value = null
}

// WebSocket で room 一覧をリアルタイム受信
let watchWs: WebSocket | null = null
let watchPingTimer: ReturnType<typeof setInterval> | null = null

function connectWatchSocket() {
  const wsUrl = `${signalingWsUrl}/watch-rooms`
  watchWs = new WebSocket(wsUrl)

  watchWs.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'rooms_updated') {
        activeRooms.value = data.rooms
      }
    } catch { /* ignore */ }
  }

  watchWs.onopen = () => {
    watchPingTimer = setInterval(() => watchWs?.send('ping'), 30000)
  }

  watchWs.onclose = () => {
    if (watchPingTimer) { clearInterval(watchPingTimer); watchPingTimer = null }
    // 切断時は3秒後に再接続
    setTimeout(connectWatchSocket, 3000)
  }

  watchWs.onerror = () => {
    watchWs?.close()
  }
}

onMounted(() => {
  loadActiveRooms() // 初回即時取得
  connectWatchSocket()
})

onUnmounted(() => {
  watchWs?.close()
  watchWs = null
  if (watchPingTimer) clearInterval(watchPingTimer)
  webRtc.disconnect()
  adminCamera.stop()
  adminAudioStream?.getTracks().forEach(t => t.stop())
  adminAudioStream = null
  adminCombinedStream.value = null
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-gray-800">遠隔点呼モニター</h2>
      <button
        class="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
        :disabled="isLoading"
        @click="loadActiveRooms"
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

        <div v-if="selectedRoomId && isCallActive">
          <TenkoVideoCall
            :local-stream="adminCombinedStream"
            :remote-stream="webRtc.remoteStream.value"
            :is-peer-connected="webRtc.isPeerConnected.value"
            :is-connected="webRtc.isConnected.value"
          />

          <div class="mt-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
            <div class="font-semibold text-blue-800">接続中</div>
            <div class="text-blue-500 text-xs mt-0.5 font-mono">{{ selectedRoomId }}</div>
          </div>

          <div class="mt-2">
            <button
              class="w-full py-2 text-sm rounded-lg bg-red-100 hover:bg-red-200 text-red-700 font-medium transition-colors"
              @click="endCall"
            >
              通話終了
            </button>
          </div>
        </div>

        <div
          v-else
          class="flex items-center justify-center aspect-video rounded-xl bg-gray-100 text-gray-400 text-sm"
        >
          右のリストからデバイスを選択して通話開始
        </div>
      </div>

      <!-- 右: 接続中デバイス一覧 -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-gray-600">
          接続待ちデバイス
          <span class="ml-1 text-gray-400">({{ activeRooms.length }}台)</span>
        </h3>

        <div v-if="isLoading && activeRooms.length === 0" class="text-center py-8 text-gray-400 text-sm">
          読み込み中...
        </div>

        <div v-else-if="activeRooms.length === 0" class="text-center py-8 text-gray-400 text-sm">
          接続中のデバイスはありません
        </div>

        <div
          v-for="roomId in activeRooms"
          :key="roomId"
          class="rounded-xl border p-4 cursor-pointer transition-colors"
          :class="selectedRoomId === roomId && isCallActive
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'"
          @click="startCall(roomId)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span class="text-sm font-medium text-gray-800">デバイス接続中</span>
            </div>
            <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              待機中
            </span>
          </div>
          <div class="mt-1 text-xs text-gray-400 font-mono truncate">{{ roomId }}</div>
          <div class="mt-2 text-xs text-blue-600 font-medium">
            クリックして通話開始 →
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
