<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CarryingItem, CarryingItemCheckInput } from '~/types'

const props = defineProps<{
  items: CarryingItem[]
}>()

const emit = defineEmits<{
  submit: [checks: CarryingItemCheckInput[]]
}>()

const checked = ref<Record<string, boolean>>({})

// 全必須項目がチェック済みか
const allRequiredChecked = computed(() =>
  props.items
    .filter(i => i.is_required)
    .every(i => checked.value[i.id])
)

function submit() {
  const checks: CarryingItemCheckInput[] = props.items.map(item => ({
    item_id: item.id,
    checked: !!checked.value[item.id],
  }))
  emit('submit', checks)
}
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-lg font-bold text-center">携行品チェック</h3>
    <p class="text-sm text-gray-500 text-center">運行に必要な携行品を確認してください</p>

    <div class="space-y-2">
      <label
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-gray-50"
        :class="{ 'bg-green-50 border-green-300': checked[item.id] }"
      >
        <input
          v-model="checked[item.id]"
          type="checkbox"
          class="w-5 h-5 accent-green-600"
        />
        <span class="flex-1 text-sm font-medium">{{ item.item_name }}</span>
        <span v-if="item.is_required" class="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">必須</span>
      </label>
    </div>

    <button
      class="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-lg disabled:opacity-40"
      :disabled="!allRequiredChecked"
      @click="submit"
    >
      確認完了
    </button>
    <p v-if="!allRequiredChecked" class="text-xs text-red-500 text-center">
      必須項目をすべてチェックしてください
    </p>
  </div>
</template>
