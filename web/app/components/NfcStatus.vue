<script setup lang="ts">
import type { NfcReadEvent } from '~/types'

const emit = defineEmits<{
  read: [employeeId: string]
}>()

const { isConnected, error, readers, bridgeVersion, connect, onRead } = useNfcWebSocket()
const { latestVersion, checkLatestVersion, isUpdateAvailable } = useNfcBridgeUpdate()

const lastReadId = ref<string | null>(null)
const readAnimation = ref(false)

const showUpdateBanner = computed(() => {
  if (!isConnected.value || !latestVersion.value) return false
  // version 未送信（旧ブリッジ）→ 常にアップデート促す
  if (!bridgeVersion.value) return true
  return isUpdateAvailable(bridgeVersion.value)
})

// 接続したら最新バージョンをチェック
watch(isConnected, async (connected) => {
  if (connected) {
    await checkLatestVersion()
  }
})

onMounted(() => {
  connect()
})

onRead((event: NfcReadEvent) => {
  lastReadId.value = event.employee_id
  readAnimation.value = true
  emit('read', event.employee_id)

  setTimeout(() => {
    readAnimation.value = false
  }, 1500)
})

const statusText = computed(() => {
  if (error.value) return error.value
  if (!isConnected.value) return 'NFC ブリッジ未接続'
  if (readers.value.length === 0) return 'NFC リーダー未検出'
  return 'NFC 待機中'
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 接続ステータス -->
    <div class="flex items-center gap-2 text-sm">
      <span
        class="w-3 h-3 rounded-full"
        :class="{
          'bg-red-500': !isConnected,
          'bg-yellow-500': isConnected && readers.length === 0,
          'bg-green-500': isConnected && readers.length > 0,
        }"
      />
      <span class="text-gray-600">{{ statusText }}</span>
    </div>

    <!-- カードタッチエリア -->
    <div
      class="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-colors"
      :class="{
        'border-gray-300 bg-gray-50': !readAnimation,
        'border-green-400 bg-green-50': readAnimation,
      }"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
      <p class="text-gray-500 font-medium">
        NFC カードをタッチしてください
      </p>
      <p v-if="lastReadId" class="mt-2 text-green-600 font-mono text-sm">
        読み取り: {{ lastReadId }}
      </p>
    </div>

    <!-- NFC ブリッジ未接続時のダウンロードリンク -->
    <p v-if="!isConnected" class="text-sm text-center text-gray-500">
      NFC ブリッジがインストールされていない場合は
      <a
        href="https://github.com/yhonda-ohishi-alc/rust-nfc-bridge/releases/latest"
        target="_blank"
        rel="noopener noreferrer"
        class="text-blue-600 underline hover:text-blue-800"
      >こちらからダウンロード</a>
    </p>

    <!-- NFC ブリッジ更新通知 -->
    <p v-if="showUpdateBanner" class="text-sm text-center text-amber-600">
      NFC ブリッジの新しいバージョン (v{{ latestVersion }}) があります。
      <a
        href="https://github.com/yhonda-ohishi-alc/rust-nfc-bridge/releases/latest"
        target="_blank"
        rel="noopener noreferrer"
        class="text-blue-600 underline hover:text-blue-800"
      >こちらからアップデート</a>
      <span v-if="bridgeVersion" class="text-gray-400 text-xs ml-1">(現在: v{{ bridgeVersion }})</span>
    </p>

    <!-- エラー表示 -->
    <p v-if="error" class="text-red-500 text-sm text-center">
      {{ error }}
    </p>
  </div>
</template>
