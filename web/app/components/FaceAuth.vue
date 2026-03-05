<script setup lang="ts">
import type { FaceAuthResult } from '~/types'

const props = defineProps<{
  employeeId: string
  mode: 'verify' | 'register'
  demoMode?: boolean
}>()

const emit = defineEmits<{
  result: [result: FaceAuthResult]
  registered: [snapshot: Blob | null]
}>()

const { verify, register } = useFaceAuth()
const { isReady, isLoading, error: modelError, load, detect } = useFaceDetection()
const { videoRef, start, stop, isActive: isCameraActive, takeSnapshotAsync } = useCamera()

const status = ref<'checking' | 'detecting' | 'success' | 'fail'>('checking')
const similarity = ref(0)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)

// --- Face detection checks ---
const checks = reactive({
  faceCount: { label: '顔検出', status: false, val: '' },
  faceConfidence: { label: '信頼度', status: false, val: '' },
  faceSize: { label: '顔サイズ', status: false, val: '' },
  facingCenter: { label: '正面向き', status: false, val: '' },
  lookingCenter: { label: '視線', status: false, val: '' },
  descriptor: { label: '特徴量', status: false, val: '' },
})

const allChecksPassed = computed(() =>
  Object.values(checks).every(c => c.status),
)

// --- Detection loop (throttled to ~3-5fps) ---
let loopTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  await start()
  load()
  startLoop()
})

onUnmounted(() => {
  stopLoop()
  stop()
})

function startLoop() {
  const loop = async () => {
    if (status.value !== 'checking') return
    if (videoRef.value && isReady.value) {
      try {
        const result = await detect(videoRef.value)
        updateChecks(result)
        drawOverlay(result)
        if (allChecksPassed.value) {
          doAuth()
          return
        }
      }
      catch { /* ignore frame errors */ }
    }
    loopTimer = setTimeout(loop, 200)
  }
  loop()
}

function stopLoop() {
  if (loopTimer != null) {
    clearTimeout(loopTimer)
    loopTimer = null
  }
}

// --- Check evaluation ---
function updateChecks(result: any) {
  const faceCount = result.face?.length ?? 0
  checks.faceCount.status = faceCount === 1
  checks.faceCount.val = `${faceCount}`

  const face = result.face?.[0]
  if (!face) {
    checks.faceConfidence.status = false
    checks.faceConfidence.val = ''
    checks.faceSize.status = false
    checks.faceSize.val = ''
    checks.facingCenter.status = false
    checks.facingCenter.val = ''
    checks.lookingCenter.status = false
    checks.lookingCenter.val = ''
    checks.descriptor.status = false
    checks.descriptor.val = ''
    return
  }

  const score = face.score ?? 0
  checks.faceConfidence.status = score >= 0.5
  checks.faceConfidence.val = `${(score * 100).toFixed(0)}%`

  const size = Math.max(face.box?.[2] ?? 0, face.box?.[3] ?? 0)
  checks.faceSize.status = size >= 100
  checks.faceSize.val = `${size.toFixed(0)}px`

  const gestures: any[] = result.gesture ?? []
  const facing = gestures.find((g: any) => g.gesture?.startsWith('facing'))
  checks.facingCenter.status = facing?.gesture === 'facing center'
  checks.facingCenter.val = facing?.gesture?.replace('facing ', '') ?? '-'

  const looking = gestures.find((g: any) => g.gesture?.startsWith('looking'))
  checks.lookingCenter.status = looking?.gesture === 'looking center'
  checks.lookingCenter.val = looking?.gesture?.replace('looking ', '') ?? '-'

  const hasDesc = (face.embedding?.length ?? 0) > 0
  checks.descriptor.status = hasDesc
  checks.descriptor.val = hasDesc ? `${face.embedding?.length ?? 0}d` : '-'
}

// --- Canvas overlay ---
let cachedCtx: CanvasRenderingContext2D | null = null

function drawOverlay(result: any) {
  const canvas = overlayCanvas.value
  const video = videoRef.value
  if (!canvas || !video) return

  const w = video.clientWidth
  const h = video.clientHeight
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    cachedCtx = null
  }

  const ctx = cachedCtx ?? (cachedCtx = canvas.getContext('2d'))
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)

  const face = result.face?.[0]
  if (!face?.box) return

  const sx = w / (video.videoWidth || w)
  const sy = h / (video.videoHeight || h)
  const [bx, by, bw, bh] = face.box
  const color = allChecksPassed.value ? '#22c55e' : '#ef4444'

  // Bounding box
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.strokeRect(bx * sx, by * sy, bw * sx, bh * sy)

  // Mesh points (every 8th point for performance)
  if (face.mesh) {
    ctx.fillStyle = color + '50'
    for (let i = 0; i < face.mesh.length; i += 8) {
      const pt = face.mesh[i]
      ctx.beginPath()
      ctx.arc(pt[0] * sx, pt[1] * sy, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// --- Auth action ---
async function doAuth() {
  if (!videoRef.value) return
  status.value = 'detecting'
  stopLoop()

  if (props.demoMode) {
    const snapshot = await takeSnapshotAsync()
    status.value = 'success'
    emit('result', { verified: true, similarity: 1.0, snapshot: snapshot ?? undefined })
    return
  }

  try {
    if (props.mode === 'register') {
      const ok = await register(props.employeeId, videoRef.value)
      status.value = ok ? 'success' : 'fail'
      if (ok) {
        const snapshot = await takeSnapshotAsync()
        emit('registered', snapshot)
      }
    }
    else {
      const result = await verify(props.employeeId, videoRef.value)
      similarity.value = result.similarity
      if (result.verified) {
        const snapshot = await takeSnapshotAsync()
        status.value = 'success'
        emit('result', { ...result, snapshot: snapshot ?? undefined })
      }
      else {
        status.value = 'fail'
        emit('result', result)
      }
    }
  }
  catch {
    status.value = 'fail'
  }
}

function retry() {
  status.value = 'checking'
  startLoop()
}

</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <!-- Camera + canvas overlay -->
    <div class="relative overflow-hidden rounded-2xl bg-black aspect-[4/3] w-full max-h-[40vh]">
      <video
        ref="videoRef"
        autoplay
        playsinline
        muted
        class="w-full h-full object-cover"
      />
      <canvas
        ref="overlayCanvas"
        class="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div
        v-if="!isCameraActive"
        class="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400"
      >
        <span>カメラ待機中...</span>
      </div>
      <div
        v-if="isLoading"
        class="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded"
      >
        モデル読み込み中...
      </div>
    </div>

    <!-- Check status grid -->
    <div class="w-full grid grid-cols-2 gap-1.5">
      <div
        v-for="(check, key) in checks"
        :key="key"
        class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="check.status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
      >
        <span class="text-sm leading-none">{{ check.status ? '\u2713' : '\u2717' }}</span>
        <span class="truncate">{{ check.label }}: {{ check.val || (check.status ? 'ok' : 'fail') }}</span>
      </div>
    </div>

    <!-- Status messages -->
    <p v-if="status === 'success'" class="text-lg font-medium text-green-600">
      {{ mode === 'register' ? '登録完了' : demoMode ? '認証完了 (デモ)' : `認証成功 (${(similarity * 100).toFixed(0)}%)` }}
    </p>
    <p v-else-if="status === 'fail'" class="text-lg font-medium text-red-600">
      {{ mode === 'register' ? '顔が検出できません' : '認証失敗' }}
    </p>
    <p v-else-if="status === 'detecting'" class="text-lg font-medium text-gray-600">
      検出中...
    </p>

    <!-- Retry button -->
    <button
      v-if="status === 'fail'"
      class="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
      @click="retry"
    >
      やり直す
    </button>

    <p v-if="modelError" class="text-red-500 text-sm">
      {{ modelError }}
    </p>
  </div>
</template>
