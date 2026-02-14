<script setup lang="ts">
const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  ready: [video: HTMLVideoElement]
}>()

const { videoRef, start, stop, isActive, error } = useCamera()

watch(() => props.active, async (val) => {
  if (val) {
    await start()
    if (videoRef.value) emit('ready', videoRef.value)
  }
  else {
    stop()
  }
})

onMounted(async () => {
  if (props.active) {
    await start()
    if (videoRef.value) emit('ready', videoRef.value)
  }
})
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl bg-black aspect-[4/3]">
    <video
      ref="videoRef"
      autoplay
      playsinline
      muted
      class="w-full h-full object-cover"
    />
    <div
      v-if="!isActive"
      class="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400"
    >
      <span>カメラ待機中...</span>
    </div>
    <div
      v-if="error"
      class="absolute inset-0 flex items-center justify-center bg-red-900/80 text-white p-4 text-center"
    >
      {{ error }}
    </div>
  </div>
</template>
