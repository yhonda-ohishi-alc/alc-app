<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { CarryingItem } from '~/types'
import { getCarryingItems, createCarryingItem, updateCarryingItem, deleteCarryingItem } from '~/utils/api'

const items = ref<CarryingItem[]>([])
const loading = ref(false)
const newItemName = ref('')
const newItemRequired = ref(true)
const editingId = ref<string | null>(null)
const editName = ref('')
const editRequired = ref(true)

async function load() {
  loading.value = true
  try {
    items.value = await getCarryingItems()
  } catch (e) {
    console.error('携行品一覧取得エラー:', e)
  } finally {
    loading.value = false
  }
}

async function addItem() {
  if (!newItemName.value.trim()) return
  try {
    await createCarryingItem({
      item_name: newItemName.value.trim(),
      is_required: newItemRequired.value,
      sort_order: items.value.length,
    })
    newItemName.value = ''
    newItemRequired.value = true
    await load()
  } catch (e) {
    console.error('携行品追加エラー:', e)
  }
}

function startEdit(item: CarryingItem) {
  editingId.value = item.id
  editName.value = item.item_name
  editRequired.value = item.is_required
}

async function saveEdit(id: string) {
  try {
    await updateCarryingItem(id, {
      item_name: editName.value.trim(),
      is_required: editRequired.value,
    })
    editingId.value = null
    await load()
  } catch (e) {
    console.error('携行品更新エラー:', e)
  }
}

async function removeItem(id: string) {
  if (!confirm('この携行品を削除しますか？')) return
  try {
    await deleteCarryingItem(id)
    await load()
  } catch (e) {
    console.error('携行品削除エラー:', e)
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-lg font-bold">携行品マスタ管理</h3>
    <p class="text-sm text-gray-500">点呼時に確認する携行品を登録します。必須項目はチェック必須になります。</p>

    <!-- 追加フォーム -->
    <div class="flex items-center gap-2 bg-gray-50 p-3 rounded">
      <input
        v-model="newItemName"
        type="text"
        placeholder="携行品名を入力"
        class="flex-1 border rounded px-3 py-1.5 text-sm"
        @keydown.enter="addItem"
      />
      <label class="flex items-center gap-1 text-sm whitespace-nowrap">
        <input v-model="newItemRequired" type="checkbox" />
        必須
      </label>
      <button
        class="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        :disabled="!newItemName.trim()"
        @click="addItem"
      >
        追加
      </button>
    </div>

    <!-- 一覧 -->
    <div v-if="loading" class="text-center py-4 text-gray-400">読み込み中...</div>
    <div v-else-if="items.length === 0" class="text-center py-4 text-gray-400">携行品が登録されていません</div>
    <div v-else class="divide-y border rounded">
      <div v-for="item in items" :key="item.id" class="flex items-center gap-2 px-3 py-2">
        <template v-if="editingId === item.id">
          <input v-model="editName" class="flex-1 border rounded px-2 py-1 text-sm" />
          <label class="flex items-center gap-1 text-sm">
            <input v-model="editRequired" type="checkbox" />
            必須
          </label>
          <button class="text-blue-600 text-sm" @click="saveEdit(item.id)">保存</button>
          <button class="text-gray-400 text-sm" @click="editingId = null">取消</button>
        </template>
        <template v-else>
          <span class="flex-1 text-sm">{{ item.item_name }}</span>
          <span v-if="item.is_required" class="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">必須</span>
          <span v-else class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">任意</span>
          <button class="text-gray-400 hover:text-blue-600 text-sm" @click="startEdit(item)">編集</button>
          <button class="text-gray-400 hover:text-red-600 text-sm" @click="removeItem(item.id)">削除</button>
        </template>
      </div>
    </div>
  </div>
</template>
