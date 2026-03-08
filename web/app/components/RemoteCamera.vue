<script setup lang="ts">
const props = defineProps<{
  stream: MediaStream | null
  fullscreen?: boolean
}>()

const videoRef = ref<HTMLVideoElement | null>(null)

watch(() => props.stream, (stream) => {
  if (videoRef.value) {
    videoRef.value.srcObject = stream
  }
})

onMounted(() => {
  if (videoRef.value && props.stream) {
    videoRef.value.srcObject = props.stream
  }
})
</script>

<template>
  <div class="relative bg-gray-900 overflow-hidden" :class="fullscreen ? 'w-full h-full' : 'rounded-xl aspect-video'">
    <video
      v-show="stream"
      ref="videoRef"
      autoplay
      playsinline
      class="w-full h-full object-contain"
    />
    <div
      v-if="!stream"
      class="absolute inset-0 flex items-center justify-center text-gray-400"
    >
      <div class="text-center">
        <svg class="mx-auto h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p class="text-sm">カメラ映像なし</p>
      </div>
    </div>
  </div>
</template>
