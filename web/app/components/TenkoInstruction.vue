<script setup lang="ts">
defineProps<{
  instruction: string | null
  managerName: string
}>()

const emit = defineEmits<{
  confirm: []
}>()
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <p class="text-xs text-blue-500 mb-1">運行管理者: {{ managerName }}</p>
      <p v-if="instruction" class="text-gray-800 whitespace-pre-wrap">{{ instruction }}</p>
      <p v-else class="text-gray-400 italic">指示事項はありません</p>
    </div>

    <button
      class="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
      @click="emit('confirm')"
    >
      確認しました
    </button>
  </div>
</template>
