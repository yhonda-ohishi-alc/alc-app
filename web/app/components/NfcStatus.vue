<script setup lang="ts">
import type { NfcReadEvent, NfcLicenseReadEvent } from '~/types'
import { parseLicenseExpiryDate, checkLicenseExpiry, formatExpiryDate, type LicenseExpiryStatus } from '~/utils/license'

const emit = defineEmits<{
  read: [employeeId: string, expiryDate?: Date]
}>()

const { isConnected, error, readers, bridgeVersion, connect, onRead, onLicenseRead } = useNfcWebSocket()
const { latestVersion, checkLatestVersion, isUpdateAvailable } = useNfcBridgeUpdate()

const lastReadId = ref<string | null>(null)
const readAnimation = ref(false)
const licenseExpiryDate = ref<Date | null>(null)
const licenseExpiryStatus = ref<LicenseExpiryStatus | null>(null)

const showUpdateBanner = computed(() => {
  if (isAndroidApp.value) return false
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

onBeforeUnmount(() => {
})

onLicenseRead((event: NfcLicenseReadEvent) => {
  if (event.expiry_date && event.card_type === 'driver_license') {
    const expiry = parseLicenseExpiryDate(event.expiry_date)
    licenseExpiryDate.value = expiry
    licenseExpiryStatus.value = expiry ? checkLicenseExpiry(expiry) : null
  } else {
    licenseExpiryDate.value = null
    licenseExpiryStatus.value = null
  }
})

onRead((event: NfcReadEvent) => {
  lastReadId.value = event.employee_id
  readAnimation.value = true
  emit('read', event.employee_id, licenseExpiryDate.value ?? undefined)

  setTimeout(() => {
    readAnimation.value = false
  }, 1500)
})

const statusText = computed(() => {
  if (error.value) return error.value
  if (!isConnected.value) return 'NFC ブリッジ未接続'
  if ((readers.value?.length ?? 0) === 0) return 'NFC リーダー未検出'
  return 'NFC 待機中'
})

// KYOCERA NFC位置ガイド
const { isAndroidApp, deviceModel } = useFingerprint()
const KYOCERA_MODELS = ['KC-T305CN', 'KC-305CN', 'KYT35', 'A404KC', 'KC-T306']
const isKyoceraTablet = computed(() => {
  if (!deviceModel.value) return false
  return KYOCERA_MODELS.some(m => deviceModel.value!.includes(m))
})
const showNfcGuide = ref(false)
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 接続ステータス -->
    <div class="flex items-center gap-2 text-sm">
      <span
        class="w-3 h-3 rounded-full"
        :class="{
          'bg-red-500': !isConnected,
          'bg-yellow-500': isConnected && (readers.value?.length ?? 0) === 0,
          'bg-green-500': isConnected && (readers.value?.length ?? 0) > 0,
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
      <button
        v-if="isKyoceraTablet"
        class="mt-2 px-3 py-1.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-200 transition-colors"
        @click="showNfcGuide = true"
      >
        NFC 位置ガイド
      </button>
      <NfcPositionGuide v-model:visible="showNfcGuide" />
      <p v-if="lastReadId" class="mt-2 text-green-600 font-mono text-sm">
        読み取り: {{ lastReadId }}
      </p>
      <!-- 免許証有効期限 -->
      <div v-if="licenseExpiryDate" class="mt-2 text-sm">
        <p class="text-gray-600">
          免許証有効期限: {{ formatExpiryDate(licenseExpiryDate) }}
        </p>
        <p
          v-if="licenseExpiryStatus === 'expired'"
          class="mt-1 px-3 py-1 bg-red-100 text-red-700 rounded-lg font-medium"
        >
          免許証の有効期限が切れています
        </p>
        <p
          v-if="licenseExpiryStatus === 'expiring_soon'"
          class="mt-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-lg font-medium"
        >
          免許証の有効期限が近づいています
        </p>
      </div>
    </div>

    <!-- NFC ブリッジ未接続時のダウンロードリンク -->
    <p v-if="!isConnected && !isAndroidApp" class="text-sm text-center text-gray-500">
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
