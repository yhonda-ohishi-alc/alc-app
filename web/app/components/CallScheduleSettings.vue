<script setup lang="ts">
import type { CallSchedule } from '~/types'

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const props = defineProps<{
  modelValue: CallSchedule
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CallSchedule]
}>()

const schedule = computed(() => props.modelValue)

const startTime = computed({
  get: () => `${String(schedule.value.startHour).padStart(2, '0')}:${String(schedule.value.startMin).padStart(2, '0')}`,
  set: (v: string) => {
    const [h, m] = v.split(':').map(Number) as [number, number]
    emit('update:modelValue', { ...schedule.value, startHour: h, startMin: m })
  },
})

const endTime = computed({
  get: () => `${String(schedule.value.endHour).padStart(2, '0')}:${String(schedule.value.endMin).padStart(2, '0')}`,
  set: (v: string) => {
    const [h, m] = v.split(':').map(Number) as [number, number]
    emit('update:modelValue', { ...schedule.value, endHour: h, endMin: m })
  },
})

function toggleDay(day: number) {
  const days = [...schedule.value.days]
  const idx = days.indexOf(day)
  if (idx >= 0) {
    days.splice(idx, 1)
  } else {
    days.push(day)
  }
  emit('update:modelValue', { ...schedule.value, days })
}
</script>

<template>
  <div class="space-y-3">
    <span class="text-sm font-medium text-gray-700">着信スケジュール</span>

    <div class="flex items-center gap-2 text-sm">
      <input
        v-model="startTime"
        type="time"
        class="border border-gray-300 rounded px-2 py-1 text-sm"
      >
      <span class="text-gray-500">〜</span>
      <input
        v-model="endTime"
        type="time"
        class="border border-gray-300 rounded px-2 py-1 text-sm"
      >
    </div>

    <div class="flex gap-1">
      <button
        v-for="(label, idx) in DAY_LABELS"
        :key="idx"
        class="w-8 h-8 text-xs rounded-full font-medium transition-colors"
        :class="schedule.days.includes(idx)
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
        @click="toggleDay(idx)"
      >
        {{ label }}
      </button>
    </div>
  </div>
</template>
