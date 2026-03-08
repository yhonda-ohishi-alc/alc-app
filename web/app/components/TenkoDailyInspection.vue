<script setup lang="ts">
import type { SubmitDailyInspection } from '~/types'

const emit = defineEmits<{
  submit: [data: SubmitDailyInspection]
}>()

type InspectionValue = 'ok' | 'ng' | null

const items = [
  { key: 'brakes', label: 'ブレーキ' },
  { key: 'tires', label: 'タイヤ' },
  { key: 'lights', label: '灯火類' },
  { key: 'steering', label: 'ハンドル' },
  { key: 'wipers', label: 'ワイパー' },
  { key: 'mirrors', label: 'ミラー' },
  { key: 'horn', label: '警音器' },
  { key: 'seatbelts', label: 'シートベルト' },
] as const

type ItemKey = typeof items[number]['key']

const values = reactive<Record<ItemKey, InspectionValue>>({
  brakes: null,
  tires: null,
  lights: null,
  steering: null,
  wipers: null,
  mirrors: null,
  horn: null,
  seatbelts: null,
})

const allAnswered = computed(() =>
  Object.values(values).every(v => v !== null),
)

const hasNg = computed(() =>
  Object.values(values).some(v => v === 'ng'),
)

function handleSubmit() {
  if (!allAnswered.value) return
  emit('submit', {
    brakes: values.brakes!,
    tires: values.tires!,
    lights: values.lights!,
    steering: values.steering!,
    wipers: values.wipers!,
    mirrors: values.mirrors!,
    horn: values.horn!,
    seatbelts: values.seatbelts!,
  })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-gray-500">各項目を点検し、結果を選択してください</p>

    <div class="grid grid-cols-2 gap-2">
      <div
        v-for="item in items"
        :key="item.key"
        class="flex items-center justify-between rounded-xl border p-3 transition-colors"
        :class="{
          'border-green-300 bg-green-50': values[item.key] === 'ok',
          'border-red-300 bg-red-50': values[item.key] === 'ng',
          'border-gray-200': values[item.key] === null,
        }"
      >
        <span class="text-sm font-medium text-gray-700">{{ item.label }}</span>
        <div class="flex gap-2">
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            :class="values[item.key] === 'ok'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
            @click="values[item.key] = 'ok'"
          >
            OK
          </button>
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            :class="values[item.key] === 'ng'
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
            @click="values[item.key] = 'ng'"
          >
            NG
          </button>
        </div>
      </div>
    </div>

    <div v-if="hasNg" class="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
      NG 項目があります。送信すると点呼はキャンセルされます。
    </div>

    <button
      :disabled="!allAnswered"
      class="w-full py-3 rounded-xl font-medium transition-colors"
      :class="allAnswered
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : 'bg-gray-200 text-gray-400 cursor-not-allowed'"
      @click="handleSubmit"
    >
      送信
    </button>
  </div>
</template>
