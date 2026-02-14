<script setup lang="ts">
import type { FaceAuthResult } from '~/types'

const props = defineProps<{
  employeeId: string
  mode: 'verify' | 'register'
}>()

const emit = defineEmits<{
  result: [result: FaceAuthResult]
  registered: []
}>()

const { verify, register } = useFaceAuth()
const { isReady, isLoading, error: modelError } = useFaceDetection()

const status = ref<'idle' | 'detecting' | 'success' | 'fail'>('idle')
const similarity = ref(0)
const videoEl = ref<HTMLVideoElement | null>(null)
const cameraActive = ref(true)

function onCameraReady(video: HTMLVideoElement) {
  videoEl.value = video
}

async function doAuth() {
  if (!videoEl.value) return

  status.value = 'detecting'

  try {
    if (props.mode === 'register') {
      const ok = await register(props.employeeId, videoEl.value)
      if (ok) {
        status.value = 'success'
        emit('registered')
      }
      else {
        status.value = 'fail'
      }
    }
    else {
      const result = await verify(props.employeeId, videoEl.value)
      similarity.value = result.similarity
      status.value = result.verified ? 'success' : 'fail'
      emit('result', result)
    }
  }
  catch {
    status.value = 'fail'
  }
}

const statusText = computed(() => {
  if (isLoading.value) return 'モデル読み込み中...'
  switch (status.value) {
    case 'idle': return props.mode === 'register' ? '顔を登録してください' : '顔認証を開始してください'
    case 'detecting': return '検出中...'
    case 'success': return props.mode === 'register' ? '登録完了' : `認証成功 (${(similarity.value * 100).toFixed(0)}%)`
    case 'fail': return props.mode === 'register' ? '顔が検出できません' : '認証失敗'
  }
})

const statusColor = computed(() => {
  switch (status.value) {
    case 'success': return 'text-green-600'
    case 'fail': return 'text-red-600'
    default: return 'text-gray-600'
  }
})
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <CameraPreview :active="cameraActive" @ready="onCameraReady" />

    <p :class="['text-lg font-medium', statusColor]">
      {{ statusText }}
    </p>

    <button
      :disabled="!isReady && !isLoading || status === 'detecting'"
      class="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
      @click="doAuth"
    >
      {{ isLoading ? '読み込み中...' : mode === 'register' ? '顔を登録' : '認証する' }}
    </button>

    <p v-if="modelError" class="text-red-500 text-sm">
      {{ modelError }}
    </p>
  </div>
</template>
