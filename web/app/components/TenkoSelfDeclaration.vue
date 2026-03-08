<script setup lang="ts">
import type { SubmitSelfDeclaration } from '~/types'

const emit = defineEmits<{
  submit: [data: SubmitSelfDeclaration]
}>()

// デフォルト値なし (null = 未選択)
const illness = ref<boolean | null>(null)
const fatigue = ref<boolean | null>(null)
const sleepDeprivation = ref<boolean | null>(null)

const allAnswered = computed(() =>
  illness.value !== null && fatigue.value !== null && sleepDeprivation.value !== null,
)

function handleSubmit() {
  if (!allAnswered.value) return
  emit('submit', {
    illness: illness.value!,
    fatigue: fatigue.value!,
    sleep_deprivation: sleepDeprivation.value!,
  })
}

const items = [
  { key: 'illness', label: '疾病', description: '体調不良や疾病の自覚症状がありますか？' },
  { key: 'fatigue', label: '疲労', description: '過度な疲労を感じていますか？' },
  { key: 'sleepDeprivation', label: '睡眠不足', description: '睡眠不足の自覚がありますか？' },
] as const

function getModel(key: 'illness' | 'fatigue' | 'sleepDeprivation') {
  switch (key) {
    case 'illness': return illness
    case 'fatigue': return fatigue
    case 'sleepDeprivation': return sleepDeprivation
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm text-gray-500">以下の項目について回答してください</p>

    <div
      v-for="item in items"
      :key="item.key"
      class="flex items-center gap-3 py-2 border-b border-gray-100"
    >
      <div class="flex-1 min-w-0">
        <span class="font-medium text-gray-700 text-sm">{{ item.label }}</span>
        <span class="text-xs text-gray-400 ml-1">{{ item.description }}</span>
      </div>
      <div class="flex gap-2 shrink-0">
        <button
          class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="getModel(item.key).value === false
            ? 'bg-green-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="getModel(item.key).value = false"
        >
          いいえ
        </button>
        <button
          class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="getModel(item.key).value === true
            ? 'bg-red-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="getModel(item.key).value = true"
        >
          はい
        </button>
      </div>
    </div>

    <button
      :disabled="!allAnswered"
      class="w-full py-2.5 rounded-xl font-medium transition-colors mt-2"
      :class="allAnswered
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
      @click="handleSubmit"
    >
      送信
    </button>
  </div>
</template>
