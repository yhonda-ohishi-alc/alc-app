<script setup lang="ts">
const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50"
      @click="close"
    >
      <!-- 半透明背景 -->
      <div class="absolute inset-0 bg-black/50" />

      <!-- NFC アンテナ位置マーカー (KYOCERA: 左33%, 上29%) -->
      <div
        class="absolute animate-pulse-border"
        style="left: 33%; top: 29%; transform: translate(-50%, -50%);"
      >
        <!-- クロスヘア (白+グロー) -->
        <svg width="120" height="120" viewBox="0 0 120 120">
          <!-- グロー効果 -->
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#glow)">
            <line x1="60" y1="5" x2="60" y2="115" stroke="white" stroke-width="4" />
            <line x1="5" y1="60" x2="115" y2="60" stroke="white" stroke-width="4" />
            <circle cx="60" cy="60" r="40" fill="none" stroke="white" stroke-width="3" stroke-dasharray="10 5" />
          </g>
        </svg>
      </div>

      <!-- 説明テキスト -->
      <div class="absolute bottom-20 left-0 right-0 text-center">
        <div class="inline-block bg-white/90 rounded-xl px-6 py-3 shadow-lg">
          <p class="text-blue-700 font-bold text-lg">＋の位置にカードをタッチ</p>
          <p class="text-gray-500 text-sm mt-1">タップで閉じる</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes pulse-border-anim {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.animate-pulse-border {
  animation: pulse-border-anim 2s ease-in-out infinite;
}
</style>
