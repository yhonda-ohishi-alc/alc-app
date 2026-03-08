<script setup lang="ts">
const STORAGE_KEY = 'call_schedule'

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

interface CallSchedule {
  enabled: boolean
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  days: number[] // 0=日, 1=月, ..., 6=土
}

const defaultSchedule: CallSchedule = {
  enabled: false,
  startHour: 8,
  startMin: 0,
  endHour: 17,
  endMin: 0,
  days: [1, 2, 3, 4, 5],
}

const schedule = ref<CallSchedule>(loadSchedule())

const startTime = computed({
  get: () => `${String(schedule.value.startHour).padStart(2, '0')}:${String(schedule.value.startMin).padStart(2, '0')}`,
  set: (v: string) => {
    const [h, m] = v.split(':').map(Number)
    schedule.value.startHour = h
    schedule.value.startMin = m
    save()
  },
})

const endTime = computed({
  get: () => `${String(schedule.value.endHour).padStart(2, '0')}:${String(schedule.value.endMin).padStart(2, '0')}`,
  set: (v: string) => {
    const [h, m] = v.split(':').map(Number)
    schedule.value.endHour = h
    schedule.value.endMin = m
    save()
  },
})

function loadSchedule(): CallSchedule {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultSchedule, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...defaultSchedule }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule.value))
  sendToAndroid()
}

function toggleEnabled() {
  schedule.value.enabled = !schedule.value.enabled
  save()
}

function toggleDay(day: number) {
  const idx = schedule.value.days.indexOf(day)
  if (idx >= 0) {
    schedule.value.days.splice(idx, 1)
  } else {
    schedule.value.days.push(day)
  }
  save()
}

function sendToAndroid() {
  const android = (window as any).Android
  if (android?.setCallSchedule) {
    android.setCallSchedule(JSON.stringify(schedule.value))
  }
}

/** 外部から現在のスケジュールを取得 */
function getSchedule(): CallSchedule {
  return schedule.value
}

defineExpose({ getSchedule })
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-gray-700">着信スケジュール</span>
      <button
        class="text-xs px-2.5 py-1 rounded-md font-medium transition-colors"
        :class="schedule.enabled
          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
        @click="toggleEnabled"
      >
        {{ schedule.enabled ? 'ON' : 'OFF' }}
      </button>
    </div>

    <template v-if="schedule.enabled">
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
    </template>
  </div>
</template>
