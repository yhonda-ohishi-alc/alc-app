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
const { isReady, isLoading, error: modelError, load, detect, latestEmbedding, terminateAll, NORM_SIZE } = useFaceDetection()
const { videoRef, start, stop, isActive: isCameraActive, takeSnapshotAsync, permissionDenied } = useCamera()
const { deviceModel } = useFingerprint()

const status = ref<'checking' | 'detecting' | 'success' | 'fail'>('checking')
const similarity = ref(0)
const waitingConfirm = ref(false)
const cameraError = ref<string | null>(null)
const blinkDetected = ref(false)
const eyeBaseline = ref<number | null>(null)
const overlayCanvas = ref<HTMLCanvasElement | null>(null)
const lastGoodEmbedding = ref<number[] | null>(null)
const frameCount = ref(0)

// --- Face detection checks ---
const checks = reactive({
  faceCount: { label: '顔検出', status: false, val: '' },
  faceConfidence: { label: '信頼度', status: false, val: '' },
  faceSize: { label: '顔サイズ', status: false, val: '' },
  facingCenter: { label: '正面向き', status: false, val: '' },
  blink: { label: 'まばたき', status: false, val: '' },
  descriptor: { label: '特徴量', status: false, val: '' },
})

const allChecksPassed = computed(() =>
  Object.values(checks).every(c => c.status),
)

// --- Detection loop (throttled to ~3-5fps) ---
let loopTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  try {
    await start('user', deviceModel.value)
    load()
    startLoop()
  } catch (e) {
    cameraError.value = e instanceof Error ? e.message : 'カメラの起動に失敗しました'
    console.error('[FaceAuth] camera start failed:', e)
  }
})

onUnmounted(() => {
  stopLoop()
  stop()
  terminateAll()
})

function startLoop() {
  const loop = async () => {
    if (status.value !== 'checking') return
    if (videoRef.value && isReady.value) {
      try {
        const t0 = performance.now()
        // lite Worker で高速検出 + full Worker がバックグラウンドで embedding 取得
        const result = await detect(videoRef.value)
        const gestureNames = (result.gesture ?? []).map((g: any) => g.gesture).join(', ')
        const mesh = result.face?.[0]?.mesh
        let eyeInfo = ''
        if (mesh && mesh.length > 450) {
          const openL = Math.abs(mesh[374][1] - mesh[386][1]) / Math.abs(mesh[443][1] - mesh[450][1])
          const openR = Math.abs(mesh[145][1] - mesh[159][1]) / Math.abs(mesh[223][1] - mesh[230][1])
          eyeInfo = ` eyeL=${openL.toFixed(3)} eyeR=${openR.toFixed(3)}`
        }
        console.log(`[FaceAuth] ${(performance.now() - t0).toFixed(0)}ms [${gestureNames}]${eyeInfo}`)
        frameCount.value++
        updateChecks(result)
        drawOverlay(result)
        // full Worker がバックグラウンドで取得した embedding を使う
        if (latestEmbedding.value && latestEmbedding.value.length > 0) {
          lastGoodEmbedding.value = latestEmbedding.value
        }
        if (allChecksPassed.value) {
          if (props.mode === 'register') {
            waitingConfirm.value = true
            stopLoop()
            return
          }
          doAuth()
          return
        }
      }
      catch { /* ignore frame errors */ }
    }
    loopTimer = setTimeout(loop, 0)
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
    checks.blink.status = false
    checks.blink.val = ''
    checks.descriptor.status = false
    checks.descriptor.val = ''
    return
  }

  const score = face.score ?? 0
  checks.faceConfidence.status = score >= 0.5
  checks.faceConfidence.val = `${(score * 100).toFixed(0)}%`

  const size = Math.max(face.box?.[2] ?? 0, face.box?.[3] ?? 0)
  checks.faceSize.status = size >= 400 && size <= 450
  const sizeHint = size < 400 ? '近づいて' : size > 450 ? '離れて' : 'OK'
  checks.faceSize.val = `${size.toFixed(0)}px ${sizeHint}`

  const gestures: any[] = result.gesture ?? []
  const facing = gestures.find((g: any) => g.gesture?.startsWith('facing'))
  checks.facingCenter.status = facing?.gesture === 'facing center'
  checks.facingCenter.val = facing?.gesture?.replace('facing ', '') ?? '-'

  // まばたき検出: 相対変化方式 (照明条件に自動適応)
  const mesh = face.mesh
  if (mesh && mesh.length > 450) {
    const openL = Math.abs(mesh[374][1] - mesh[386][1]) / Math.abs(mesh[443][1] - mesh[450][1])
    const openR = Math.abs(mesh[145][1] - mesh[159][1]) / Math.abs(mesh[223][1] - mesh[230][1])
    const avgOpen = (openL + openR) / 2

    if (eyeBaseline.value === null) {
      eyeBaseline.value = avgOpen
    } else if (!blinkDetected.value && eyeBaseline.value !== null) {
      const ratio = avgOpen / eyeBaseline.value
      if (ratio < 0.88) blinkDetected.value = true
    }
  }
  checks.blink.status = blinkDetected.value
  if (blinkDetected.value) {
    checks.blink.val = '検出済'
  } else if (eyeBaseline.value === null) {
    checks.blink.val = '準備中'
  } else {
    checks.blink.val = '瞬きしてください'
  }

  // embedding は full Worker からバックグラウンドで取得 (latestEmbedding)
  const hasDesc = (latestEmbedding.value?.length ?? 0) > 0
  checks.descriptor.status = hasDesc
  checks.descriptor.val = hasDesc ? `${latestEmbedding.value?.length ?? 0}d` : '-'
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

  const sx = w / NORM_SIZE
  const sy = h / NORM_SIZE
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
    terminateAll()
    const snapshot = await takeSnapshotAsync()
    status.value = 'success'
    emit('result', { verified: true, similarity: 1.0, snapshot: snapshot ?? undefined })
    return
  }

  try {
    if (props.mode === 'register') {
      const ok = await register(props.employeeId, videoRef.value, lastGoodEmbedding.value ?? undefined)
      terminateAll()
      status.value = ok ? 'success' : 'fail'
      if (ok) {
        const snapshot = await takeSnapshotAsync()
        emit('registered', snapshot)
      }
    }
    else {
      const result = await verify(props.employeeId, videoRef.value, lastGoodEmbedding.value ?? undefined)
      terminateAll()
      similarity.value = result.similarity
      console.log('[FaceAuth] verify result: similarity=' + result.similarity.toFixed(3) + ' verified=' + result.verified)
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
    terminateAll()
    status.value = 'fail'
  }
}

function confirmRegister() {
  waitingConfirm.value = false
  doAuth()
}

function resetChecks() {
  blinkDetected.value = false
  lastGoodEmbedding.value = null
  frameCount.value = 0
  for (const key of Object.keys(checks) as (keyof typeof checks)[]) {
    checks[key].status = false
    checks[key].val = ''
  }
}

function retryConfirm() {
  waitingConfirm.value = false
  resetChecks()
  startLoop()
}

function retry() {
  status.value = 'checking'
  waitingConfirm.value = false
  resetChecks()
  terminateAll()
  load()
  startLoop()
}

function fullReset() {
  status.value = 'checking'
  waitingConfirm.value = false
  eyeBaseline.value = null
  resetChecks()
  terminateAll()
  load()
  startLoop()
}

async function retryCamera() {
  cameraError.value = null
  try {
    await start('user', deviceModel.value)
    load()
    startLoop()
  } catch (e) {
    cameraError.value = e instanceof Error ? e.message : 'カメラの起動に失敗しました'
  }
}

</script>

<template>
  <div class="fixed inset-0 z-50 bg-black flex flex-col">
    <!-- Camera fullscreen -->
    <div class="relative flex-1 min-h-0">
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
      <!-- Reload button (top-right) -->
      <button
        v-if="!cameraError"
        class="absolute top-2 right-2 z-10 bg-white/30 hover:bg-white/50 rounded-full w-10 h-10 flex items-center justify-center transition-colors"
        @click="fullReset"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 2v6h-6" /><path d="M21 8A9 9 0 0 0 5.64 5.64L3 8" /><path d="M3 22v-6h6" /><path d="M3 16a9 9 0 0 0 15.36 2.36L21 16" />
        </svg>
      </button>

      <div
        v-if="cameraError"
        class="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white gap-3 p-4"
      >
        <span class="text-red-400 text-sm text-center">{{ cameraError }}</span>
        <p v-if="permissionDenied" class="text-gray-300 text-xs text-center">
          設定 &gt; アプリ &gt; カメラ の権限を許可してから再試行してください
        </p>
        <button
          class="px-4 py-2 bg-blue-600 rounded-lg text-sm hover:bg-blue-700 transition-colors"
          @click="retryCamera"
        >
          再試行
        </button>
      </div>
      <div
        v-else-if="!isCameraActive"
        class="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400"
      >
        <span>カメラ待機中...</span>
      </div>
      <div
        v-if="isLoading"
        class="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded"
      >
        モデル読み込み中...
      </div>
      <!-- Check status grid (overlay on camera) -->
      <div class="absolute bottom-0 inset-x-0 bg-black/60 p-2 grid grid-cols-2 gap-1 pointer-events-none">
        <div
          v-for="(check, key) in checks"
          :key="key"
          class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
          :class="check.status ? 'text-green-400' : 'text-red-400'"
        >
          <span class="text-xs leading-none">{{ check.status ? '✓' : '✗' }}</span>
          <span class="truncate">{{ check.label }}: {{ check.val || (check.status ? 'ok' : 'fail') }}</span>
        </div>
      </div>

      <!-- Status overlay (centered on camera) -->
      <div v-if="status === 'success'" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p class="text-2xl font-bold text-green-400 bg-black/60 px-6 py-3 rounded-xl">
          {{ mode === 'register' ? '登録完了' : demoMode ? '認証完了 (デモ)' : `認証成功 (${(similarity * 100).toFixed(0)}%)` }}
        </p>
      </div>
      <div v-else-if="status === 'fail'" class="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <p class="text-2xl font-bold text-red-400 bg-black/60 px-6 py-3 rounded-xl">
          {{ mode === 'register' ? '顔が検出できません' : '認証失敗' }}
        </p>
        <button
          class="px-8 py-3 bg-white/90 text-gray-800 rounded-xl font-medium text-lg hover:bg-white transition-colors"
          @click="retry"
        >
          やり直す
        </button>
      </div>
      <div v-else-if="status === 'detecting'" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <p class="text-xl font-medium text-white bg-black/60 px-6 py-3 rounded-xl">
          検出中...
        </p>
      </div>

      <!-- Register confirmation overlay -->
      <div v-if="waitingConfirm" class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40">
        <p class="text-xl font-medium text-white bg-black/60 px-6 py-3 rounded-xl">この顔で登録しますか？</p>
        <div class="flex gap-3">
          <button
            class="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium text-lg hover:bg-blue-700 transition-colors"
            @click="confirmRegister"
          >
            登録する
          </button>
          <button
            class="px-8 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium text-lg hover:bg-gray-300 transition-colors"
            @click="retryConfirm"
          >
            やり直す
          </button>
        </div>
      </div>
    </div>

    <p v-if="modelError" class="text-red-400 text-sm text-center p-2">
      {{ modelError }}
    </p>
  </div>
</template>
