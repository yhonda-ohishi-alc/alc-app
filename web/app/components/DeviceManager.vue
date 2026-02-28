<script setup lang="ts">
const { ports, isSupported, refreshPorts, requestNewPort, forgetPort } = useSerialDeviceManager()

onMounted(() => refreshPorts())

function formatPortInfo(info: SerialPortInfo): string {
  if (info.usbVendorId !== undefined) {
    const vid = info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')
    const pid = (info.usbProductId ?? 0).toString(16).toUpperCase().padStart(4, '0')
    return `USB (VID: 0x${vid}, PID: 0x${pid})`
  }
  return 'シリアルポート'
}
</script>

<template>
  <div>
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-medium text-gray-700">登録済みデバイス</h3>
          <p class="text-xs text-gray-500 mt-1">
            ブラウザに許可済みのシリアルポート一覧
          </p>
        </div>
        <button
          v-if="isSupported"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          @click="requestNewPort"
        >
          新しいデバイスを追加
        </button>
      </div>

      <!-- WebSerial 非対応 -->
      <div v-if="!isSupported" class="text-center py-4 text-sm text-red-600">
        WebSerial API 非対応ブラウザです (Chrome/Edge をご使用ください)
      </div>

      <!-- ポート一覧 -->
      <div v-else-if="ports.length > 0" class="divide-y divide-gray-100">
        <div
          v-for="(entry, i) in ports"
          :key="i"
          class="flex items-center justify-between py-3"
        >
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full bg-green-500" />
            <div>
              <p class="text-sm text-gray-800 font-medium">FC-1200</p>
              <p class="text-xs text-gray-500 font-mono">{{ formatPortInfo(entry.info) }}</p>
            </div>
          </div>
          <button
            class="px-3 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
            @click="forgetPort(entry.port)"
          >
            登録解除
          </button>
        </div>
      </div>

      <!-- 空状態 -->
      <div v-else class="text-center py-6 text-gray-500 text-sm">
        <p>登録済みデバイスはありません</p>
        <p class="text-xs mt-1">「新しいデバイスを追加」から FC-1200 を登録してください</p>
      </div>
    </div>

    <!-- 説明 -->
    <div class="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
      <p class="font-medium mb-1">デバイス登録について</p>
      <p class="text-xs text-blue-700">
        ここでデバイスを登録すると、測定画面で自動的に FC-1200 に接続されます。
        USB ポートを変更する場合は、古いデバイスを「登録解除」してから新しいデバイスを追加してください。
      </p>
    </div>
  </div>
</template>
