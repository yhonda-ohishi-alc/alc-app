<script setup lang="ts">
const props = defineProps<{
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isPeerConnected: boolean
  isConnected: boolean
  fullscreen?: boolean
}>()

const emit = defineEmits<{
  (e: 'mute-change', muted: boolean): void
}>()

const isMuted = ref(false)
const isCameraOff = ref(false)

const localVideoRef = ref<HTMLVideoElement | null>(null)

watch(() => props.localStream, (stream) => {
  if (localVideoRef.value) {
    localVideoRef.value.srcObject = stream
  }
})

onMounted(() => {
  if (localVideoRef.value && props.localStream) {
    localVideoRef.value.srcObject = props.localStream
  }
})

function toggleMute() {
  if (!props.localStream) return
  isMuted.value = !isMuted.value
  for (const track of props.localStream.getAudioTracks()) {
    track.enabled = !isMuted.value
  }
  emit('mute-change', isMuted.value)
}

function toggleCamera() {
  if (!props.localStream) return
  isCameraOff.value = !isCameraOff.value
  for (const track of props.localStream.getVideoTracks()) {
    track.enabled = !isCameraOff.value
  }
}

const statusLabel = computed(() => {
  if (!props.isConnected) return 'シグナリング接続中...'
  if (!props.isPeerConnected) return '相手を待機中'
  return '通話中'
})

const statusColor = computed(() => {
  if (!props.isPeerConnected) return 'bg-yellow-500'
  return 'bg-green-500'
})
</script>

<template>
  <!-- 遠隔点呼ビデオ通話パネル -->
  <div class="relative bg-gray-900 overflow-hidden" :class="fullscreen ? 'h-full' : 'rounded-xl'" :style="fullscreen ? '' : 'aspect-ratio: 16/9; max-height: 35vh;'">
    <!-- 相手映像 (大) -->
    <RemoteCamera :stream="remoteStream" :fullscreen="fullscreen" />

    <!-- 自分映像 (小・右下 PiP) -->
    <div class="absolute bottom-3 right-3 w-32 rounded-lg overflow-hidden shadow-lg border border-gray-600 bg-gray-800" style="aspect-ratio: 4/3;">
      <video
        ref="localVideoRef"
        autoplay
        playsinline
        muted
        class="w-full h-full object-cover"
        :class="{ 'opacity-0': isCameraOff }"
      />
      <div v-if="isCameraOff" class="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
        カメラOFF
      </div>
    </div>

    <!-- 接続状態バッジ -->
    <div class="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1">
      <span class="inline-block w-2 h-2 rounded-full" :class="statusColor" />
      <span class="text-white text-xs font-medium">{{ statusLabel }}</span>
    </div>

    <!-- コントロールボタン (下中央) -->
    <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3">
      <!-- マイクミュート -->
      <button
        class="flex items-center justify-center w-10 h-10 rounded-full transition-colors"
        :class="isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-black/60 hover:bg-black/80'"
        :title="isMuted ? 'ミュート解除' : 'ミュート'"
        @click="toggleMute"
      >
        <svg v-if="!isMuted" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <svg v-else class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clip-rule="evenodd" />
        </svg>
      </button>

      <!-- カメラON/OFF -->
      <button
        class="flex items-center justify-center w-10 h-10 rounded-full transition-colors"
        :class="isCameraOff ? 'bg-red-600 hover:bg-red-700' : 'bg-black/60 hover:bg-black/80'"
        :title="isCameraOff ? 'カメラON' : 'カメラOFF'"
        @click="toggleCamera"
      >
        <svg v-if="!isCameraOff" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <svg v-else class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </button>
    </div>
  </div>
</template>
