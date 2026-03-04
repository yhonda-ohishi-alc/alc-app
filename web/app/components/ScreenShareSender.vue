<script setup lang="ts">
const config = useRuntimeConfig()
const signalingUrl = config.public.signalingUrl as string

const { isSharing, roomId, error, isPeerConnected, isConnected, startSharing, stopSharing } = useScreenShare()

const shortRoomId = computed(() => roomId.value ? roomId.value.slice(-8).toUpperCase() : null)

const statusLabel = computed(() => {
  if (isPeerConnected.value) return '管理者が視聴中'
  if (isConnected.value) return '待機中...'
  return '接続中...'
})
</script>

<template>
  <!-- 固定フローティング UI: タブ切り替えに関係なく常時表示 -->
  <div class="fixed bottom-4 right-4 z-50">
    <!-- 共有中: コンパクトパネル -->
    <div
      v-if="isSharing"
      class="rounded-2xl shadow-lg border bg-white overflow-hidden w-52"
    >
      <!-- ステータスヘッダー -->
      <div
        class="flex items-center gap-2 px-3 py-2"
        :class="isPeerConnected ? 'bg-green-500' : 'bg-yellow-400'"
      >
        <span class="w-2 h-2 rounded-full bg-white opacity-90 animate-pulse" />
        <span class="text-xs font-semibold text-white flex-1">{{ statusLabel }}</span>
      </div>

      <!-- 共有 ID -->
      <div class="px-3 py-2 text-center">
        <div class="text-xs text-gray-400 mb-0.5">共有 ID</div>
        <div class="font-mono text-lg font-bold tracking-widest text-gray-800">{{ shortRoomId }}</div>
      </div>

      <!-- エラー -->
      <div v-if="error" class="px-3 pb-2 text-xs text-red-600 text-center">{{ error }}</div>

      <!-- 停止ボタン -->
      <div class="px-3 pb-3">
        <button
          class="w-full py-1.5 text-xs font-semibold rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
          @click="stopSharing"
        >
          共有を停止
        </button>
      </div>
    </div>

    <!-- 未共有: 小さいボタン -->
    <template v-else>
      <div v-if="error" class="mb-2 rounded-lg shadow bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 max-w-52">
        {{ error }}
      </div>
      <button
        class="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors"
        @click="startSharing(signalingUrl)"
      >
        <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        画面共有
      </button>
    </template>
  </div>
</template>
