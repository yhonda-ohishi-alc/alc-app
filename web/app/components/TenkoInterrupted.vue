<script setup lang="ts">
import type { SafetyJudgment } from '~/types'

defineProps<{
  employeeName: string
  reason?: string
  safetyJudgment?: SafetyJudgment | null
}>()

const emit = defineEmits<{
  reset: []
}>()

const failItemLabels: Record<string, string> = {
  illness: '疾病',
  fatigue: '疲労',
  sleep_deprivation: '睡眠不足',
  systolic: '収縮期血圧',
  diastolic: '拡張期血圧',
  temperature: '体温',
}
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <!-- 警告アイコン -->
    <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
      <svg class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    </div>

    <h3 class="text-xl font-bold text-red-700">点呼中断</h3>
    <p class="text-gray-500 text-sm">{{ employeeName }}</p>

    <!-- 安全判定失敗の詳細 -->
    <div v-if="safetyJudgment && safetyJudgment.status === 'fail'" class="w-full rounded-xl border border-red-200 bg-red-50 p-4">
      <p class="text-sm font-medium text-red-700 mb-2">安全運転判定: 不合格</p>
      <ul class="text-sm text-red-600 space-y-1">
        <li v-for="item in safetyJudgment.failed_items" :key="item" class="flex items-center gap-2">
          <span class="text-red-500">&#x2717;</span>
          {{ failItemLabels[item] || item }}
        </li>
      </ul>
    </div>

    <!-- その他の理由 -->
    <div v-else-if="reason" class="w-full rounded-xl border border-red-200 bg-red-50 p-4">
      <p class="text-sm text-red-700">{{ reason }}</p>
    </div>

    <div class="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
      <p class="text-sm text-amber-700 font-medium">運行管理者に連絡してください</p>
    </div>

    <button
      class="w-full py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
      @click="emit('reset')"
    >
      最初に戻る
    </button>
  </div>
</template>
