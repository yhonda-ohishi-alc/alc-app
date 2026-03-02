<script setup lang="ts">
import type { SubmitOperationReport } from '~/types'
import { uploadReportAudio } from '~/utils/api'

const emit = defineEmits<{
  submit: [data: SubmitOperationReport]
}>()

// 各項目の報告有無 (null = 未選択、要件：デフォルト設定不可)
const vehicleRoadHasReport = ref<boolean | null>(null)
const driverAlternationHasReport = ref<boolean | null>(null)

// テキスト入力
const vehicleRoadText = ref('')
const driverAlternationText = ref('')

// 入力方式 ('text' | 'audio')
const vehicleRoadInputMode = ref<'text' | 'audio'>('text')
const driverAlternationInputMode = ref<'text' | 'audio'>('text')

// 音声録音状態
const vehicleRoadAudioUrl = ref<string>()
const driverAlternationAudioUrl = ref<string>()
const vehicleRoadAudioBlob = ref<Blob>()
const driverAlternationAudioBlob = ref<Blob>()
const recordingTarget = ref<'vehicle' | 'driver' | null>(null)
const mediaRecorder = ref<MediaRecorder | null>(null)
const isUploading = ref(false)

// 各項目の値が決定しているか
function isItemComplete(hasReport: boolean | null, inputMode: string, text: string, audioBlob?: Blob): boolean {
  if (hasReport === null) return false
  if (!hasReport) return true // "報告なし" 選択済み
  if (inputMode === 'text') return text.trim().length > 0
  return !!audioBlob
}

const isValid = computed(() =>
  isItemComplete(vehicleRoadHasReport.value, vehicleRoadInputMode.value, vehicleRoadText.value, vehicleRoadAudioBlob.value)
  && isItemComplete(driverAlternationHasReport.value, driverAlternationInputMode.value, driverAlternationText.value, driverAlternationAudioBlob.value)
)

// 録音開始
async function startRecording(target: 'vehicle' | 'driver') {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      if (target === 'vehicle') {
        vehicleRoadAudioBlob.value = blob
      } else {
        driverAlternationAudioBlob.value = blob
      }
      stream.getTracks().forEach(t => t.stop())
      recordingTarget.value = null
    }

    mediaRecorder.value = recorder
    recordingTarget.value = target
    recorder.start()
  } catch {
    // マイクアクセス拒否
  }
}

function stopRecording() {
  if (mediaRecorder.value && mediaRecorder.value.state === 'recording') {
    mediaRecorder.value.stop()
  }
}

// 録音削除
function clearAudio(target: 'vehicle' | 'driver') {
  if (target === 'vehicle') {
    vehicleRoadAudioBlob.value = undefined
    vehicleRoadAudioUrl.value = undefined
  } else {
    driverAlternationAudioBlob.value = undefined
    driverAlternationAudioUrl.value = undefined
  }
}

async function handleSubmit() {
  if (!isValid.value) return
  isUploading.value = true

  try {
    // 音声ファイルがあればアップロード
    if (vehicleRoadAudioBlob.value) {
      vehicleRoadAudioUrl.value = await uploadReportAudio(vehicleRoadAudioBlob.value)
    }
    if (driverAlternationAudioBlob.value) {
      driverAlternationAudioUrl.value = await uploadReportAudio(driverAlternationAudioBlob.value)
    }

    const getStatusText = (hasReport: boolean | null, inputMode: string, text: string): string => {
      if (!hasReport) return '報告なし'
      if (inputMode === 'audio') return '音声報告あり'
      return text.trim()
    }

    emit('submit', {
      vehicle_road_status: getStatusText(vehicleRoadHasReport.value, vehicleRoadInputMode.value, vehicleRoadText.value),
      driver_alternation: getStatusText(driverAlternationHasReport.value, driverAlternationInputMode.value, driverAlternationText.value),
      vehicle_road_audio_url: vehicleRoadAudioUrl.value,
      driver_alternation_audio_url: driverAlternationAudioUrl.value,
    })
  } finally {
    isUploading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <p class="text-sm text-gray-500">各項目ごとに報告してください</p>

    <!-- 項目1: 車両・道路・運行の状況 -->
    <div class="border border-gray-200 rounded-xl p-4">
      <label class="block text-sm font-medium text-gray-700 mb-2">1. 自動車・道路・運行の状況</label>

      <div class="flex gap-2 mb-3">
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="vehicleRoadHasReport === true
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="vehicleRoadHasReport = true"
        >
          報告あり
        </button>
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="vehicleRoadHasReport === false
            ? 'bg-green-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="vehicleRoadHasReport = false"
        >
          報告なし
        </button>
      </div>

      <template v-if="vehicleRoadHasReport">
        <!-- 入力方式選択 -->
        <div class="flex gap-2 mb-2">
          <button
            class="px-3 py-1 rounded text-xs font-medium transition-colors"
            :class="vehicleRoadInputMode === 'text' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'"
            @click="vehicleRoadInputMode = 'text'"
          >
            テキスト入力
          </button>
          <button
            class="px-3 py-1 rounded text-xs font-medium transition-colors"
            :class="vehicleRoadInputMode === 'audio' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'"
            @click="vehicleRoadInputMode = 'audio'"
          >
            音声録音
          </button>
        </div>

        <textarea
          v-if="vehicleRoadInputMode === 'text'"
          v-model="vehicleRoadText"
          rows="2"
          placeholder="車両の異常、道路状況、運行の状況等"
          class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div v-else class="flex flex-col gap-2">
          <div v-if="!vehicleRoadAudioBlob" class="flex gap-2">
            <button
              v-if="recordingTarget !== 'vehicle'"
              class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium"
              @click="startRecording('vehicle')"
            >
              録音開始
            </button>
            <button
              v-else
              class="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium animate-pulse"
              @click="stopRecording"
            >
              録音停止
            </button>
          </div>
          <div v-else class="flex items-center gap-2">
            <audio :src="URL.createObjectURL(vehicleRoadAudioBlob)" controls class="h-8 flex-1" />
            <button class="text-xs text-red-500 underline" @click="clearAudio('vehicle')">削除</button>
          </div>
        </div>
      </template>
    </div>

    <!-- 項目2: 交替運転者への通告 -->
    <div class="border border-gray-200 rounded-xl p-4">
      <label class="block text-sm font-medium text-gray-700 mb-2">2. 交替運転者への通告</label>

      <div class="flex gap-2 mb-3">
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="driverAlternationHasReport === true
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="driverAlternationHasReport = true"
        >
          報告あり
        </button>
        <button
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="driverAlternationHasReport === false
            ? 'bg-green-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="driverAlternationHasReport = false"
        >
          報告なし
        </button>
      </div>

      <template v-if="driverAlternationHasReport">
        <!-- 入力方式選択 -->
        <div class="flex gap-2 mb-2">
          <button
            class="px-3 py-1 rounded text-xs font-medium transition-colors"
            :class="driverAlternationInputMode === 'text' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'"
            @click="driverAlternationInputMode = 'text'"
          >
            テキスト入力
          </button>
          <button
            class="px-3 py-1 rounded text-xs font-medium transition-colors"
            :class="driverAlternationInputMode === 'audio' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'"
            @click="driverAlternationInputMode = 'audio'"
          >
            音声録音
          </button>
        </div>

        <textarea
          v-if="driverAlternationInputMode === 'text'"
          v-model="driverAlternationText"
          rows="2"
          placeholder="交替の有無、通告内容等"
          class="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div v-else class="flex flex-col gap-2">
          <div v-if="!driverAlternationAudioBlob" class="flex gap-2">
            <button
              v-if="recordingTarget !== 'driver'"
              class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium"
              @click="startRecording('driver')"
            >
              録音開始
            </button>
            <button
              v-else
              class="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium animate-pulse"
              @click="stopRecording"
            >
              録音停止
            </button>
          </div>
          <div v-else class="flex items-center gap-2">
            <audio :src="URL.createObjectURL(driverAlternationAudioBlob)" controls class="h-8 flex-1" />
            <button class="text-xs text-red-500 underline" @click="clearAudio('driver')">削除</button>
          </div>
        </div>
      </template>
    </div>

    <button
      :disabled="!isValid || isUploading"
      class="w-full py-3 rounded-xl font-medium transition-colors"
      :class="isValid && !isUploading
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
      @click="handleSubmit"
    >
      {{ isUploading ? 'アップロード中...' : '送信' }}
    </button>
  </div>
</template>
