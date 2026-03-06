<script setup lang="ts">
// BLE Gateway の既知 VID:PID (CH340, CP210x, Espressif, FTDI FT232R)
const BLE_GW_DEVICES = [
  { vid: 0x1A86 },            // CH340/CH552
  { vid: 0x10C4 },            // CP210x
  { vid: 0x303A },            // Espressif native USB
  { vid: 0x0403, pid: 0x6001 }, // FTDI FT232R (ATOM Lite)
]

const { ports, isSupported, refreshPorts, forgetPort } = useSerialDeviceManager()

// FC-1200 composable
const fc1200 = useFc1200Serial()

// BLE Gateway composable
const bleGw = useBleGateway()

// FC-1200 diagnostics
const fc1200Testing = ref(false)
const fc1200TestResult = ref<string | null>(null)
const fc1200Measuring = ref(false)

// BLE GW diagnostics
const bleGwTesting = ref(false)
const bleGwTestResult = ref<string | null>(null)

onMounted(() => refreshPorts())

function formatVidPid(info: SerialPortInfo): string {
  if (info.usbVendorId !== undefined) {
    const vid = info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')
    const pid = (info.usbProductId ?? 0).toString(16).toUpperCase().padStart(4, '0')
    return `VID:0x${vid} PID:0x${pid}`
  }
  return 'シリアルポート'
}

function isBleGwDevice(info: SerialPortInfo): boolean {
  if (info.usbVendorId === undefined) return false
  return BLE_GW_DEVICES.some(d =>
    d.vid === info.usbVendorId && (d.pid === undefined || d.pid === info.usbProductId),
  )
}

// FC-1200 ポート (BLE GW 以外の USB デバイス)
const fc1200Ports = computed(() =>
  ports.value.filter(e => !isBleGwDevice(e.info)),
)

// BLE Gateway ポート
const bleGwPorts = computed(() =>
  ports.value.filter(e => isBleGwDevice(e.info)),
)

async function registerFc1200() {
  if (!isSupported) return
  try {
    // FC-1200 用: ESP32 以外のデバイスを選択
    await navigator.serial.requestPort()
    await refreshPorts()
  } catch {}
}

async function registerBleGw() {
  if (!isSupported) return
  try {
    await navigator.serial.requestPort({
      filters: BLE_GW_DEVICES.map(d => ({
        usbVendorId: d.vid,
        ...(d.pid !== undefined && { usbProductId: d.pid }),
      })),
    })
    await refreshPorts()
  } catch {}
}

async function testFc1200() {
  fc1200Testing.value = true
  fc1200Measuring.value = false
  fc1200TestResult.value = null
  try {
    const success = await fc1200.autoConnect()
    if (success) {
      fc1200TestResult.value = '接続成功 — 測定を開始します'
      fc1200Measuring.value = true
      fc1200.startMeasurement()
    } else {
      fc1200TestResult.value = '接続失敗 — デバイスが USB に接続されているか確認してください'
      fc1200Testing.value = false
    }
  } catch (e) {
    fc1200TestResult.value = `エラー: ${e instanceof Error ? e.message : '不明'}`
    fc1200Testing.value = false
  }
}

async function stopFc1200Test() {
  fc1200Measuring.value = false
  fc1200Testing.value = false
  await fc1200.disconnect()
}

// 測定完了 or エラーで自動終了
watch(fc1200.result, (val) => {
  if (val && fc1200Measuring.value) {
    fc1200TestResult.value = `測定完了: ${val.alcoholValue} mg/L (${val.resultType === 'normal' ? '正常' : '超過'})`
    fc1200Measuring.value = false
    fc1200Testing.value = false
    fc1200.disconnect()
  }
})

watch(fc1200.error, (val) => {
  if (val && fc1200Measuring.value) {
    fc1200TestResult.value = `エラー: ${val}`
    fc1200Measuring.value = false
    fc1200Testing.value = false
    fc1200.disconnect()
  }
})

const fc1200StateText = computed(() => {
  switch (fc1200.state.value) {
    case 'warming_up': return 'ウォームアップ中...'
    case 'blow_waiting': return '息を吹きかけてください'
    case 'measuring': return '測定中...'
    default: return ''
  }
})

async function testBleGw() {
  bleGwTesting.value = true
  bleGwTestResult.value = null
  try {
    const success = await bleGw.autoConnect()
    if (success) {
      // ready メッセージ待ち (最大3秒)
      await new Promise(r => setTimeout(r, 3000))
      const ver = bleGw.gatewayVersion.value
      const thermo = bleGw.thermometerConnected.value
      const bp = bleGw.bloodPressureConnected.value
      bleGwTestResult.value = [
        `接続成功`,
        ver ? `FW: v${ver}` : null,
        `体温計: ${thermo ? '接続' : '未接続'}`,
        `血圧計: ${bp ? '接続' : '未接続'}`,
      ].filter(Boolean).join(' / ')
    } else {
      bleGwTestResult.value = '接続失敗 — ATOM Lite が USB に接続されているか確認してください'
    }
  } catch (e) {
    bleGwTestResult.value = `エラー: ${e instanceof Error ? e.message : '不明'}`
  } finally {
    bleGwTesting.value = false
  }
}

async function syncFc1200Date() {
  if (!fc1200.isConnected.value) {
    const success = await fc1200.autoConnect()
    if (!success) return
  }
  fc1200.updateDeviceDate()
  fc1200TestResult.value = 'デバイス日時を同期しました'
  await new Promise(r => setTimeout(r, 2000))
  await fc1200.disconnect()
}
</script>

<template>
  <div class="w-full max-w-lg mx-auto px-4 py-4 space-y-6">
    <!-- WebSerial 非対応 (デバイス管理はPC版のみ) -->
    <div v-if="!isSupported" class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
      <p class="text-yellow-700 text-sm">デバイス管理は Chrome/Edge ブラウザ版でのみ利用可能です</p>
    </div>

    <template v-else>
      <!-- FC-1200 セクション -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-gray-800">FC-1200 アルコールチェッカー</h3>
            <p class="text-xs text-gray-500">9600 baud</p>
          </div>
          <button
            class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition-colors"
            @click="registerFc1200"
          >
            デバイスを追加
          </button>
        </div>

        <div class="p-4">
          <!-- 登録済みポート -->
          <div v-if="fc1200Ports.length > 0" class="divide-y divide-gray-100 mb-3">
            <div
              v-for="(entry, i) in fc1200Ports"
              :key="i"
              class="flex items-center justify-between py-2"
            >
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-green-500" />
                <div>
                  <p class="text-sm text-gray-800">FC-1200</p>
                  <p class="text-xs text-gray-500 font-mono">{{ formatVidPid(entry.info) }}</p>
                </div>
              </div>
              <button
                class="px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50"
                @click="forgetPort(entry.port)"
              >
                解除
              </button>
            </div>
          </div>
          <p v-else class="text-xs text-gray-400 mb-3">未登録</p>

          <!-- 測定中の状態表示 -->
          <div v-if="fc1200Measuring" class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3">
            <div class="flex items-center gap-3">
              <span class="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              <span class="text-sm font-medium text-blue-700">{{ fc1200StateText || '接続中...' }}</span>
            </div>
            <div v-if="fc1200.state.value === 'blow_waiting'" class="mt-3 bg-blue-100 rounded-lg p-3 text-center">
              <p class="text-blue-800 font-bold">息を吹きかけてください</p>
              <p class="text-blue-600 text-xs mt-1">FC-1200 のセンサー部に向かって約5秒間</p>
            </div>
            <button
              class="mt-3 px-3 py-1.5 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
              @click="stopFc1200Test"
            >
              中止
            </button>
          </div>

          <!-- 診断ボタン -->
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              :disabled="fc1200Testing || fc1200Ports.length === 0"
              @click="testFc1200"
            >
              {{ fc1200Testing ? 'テスト中...' : 'テスト測定' }}
            </button>
            <button
              class="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              :disabled="fc1200Testing || fc1200Ports.length === 0"
              @click="syncFc1200Date"
            >
              日時同期
            </button>
          </div>
          <p v-if="fc1200TestResult" class="text-xs mt-2" :class="fc1200TestResult.includes('失敗') || fc1200TestResult.includes('エラー') ? 'text-red-600' : 'text-green-600'">
            {{ fc1200TestResult }}
          </p>
        </div>
      </div>

      <!-- BLE ゲートウェイ セクション -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-gray-800">BLE ゲートウェイ (ATOM Lite)</h3>
            <p class="text-xs text-gray-500">体温計・血圧計接続用 / 115200 baud</p>
          </div>
          <button
            class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition-colors"
            @click="registerBleGw"
          >
            デバイスを追加
          </button>
        </div>

        <div class="p-4">
          <!-- 登録済みポート -->
          <div v-if="bleGwPorts.length > 0" class="divide-y divide-gray-100 mb-3">
            <div
              v-for="(entry, i) in bleGwPorts"
              :key="i"
              class="flex items-center justify-between py-2"
            >
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" :class="bleGw.isConnected.value ? 'bg-green-500' : 'bg-gray-300'" />
                <div>
                  <p class="text-sm text-gray-800">ATOM Lite BLE Gateway</p>
                  <p class="text-xs text-gray-500 font-mono">{{ formatVidPid(entry.info) }}</p>
                </div>
              </div>
              <button
                class="px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50"
                @click="forgetPort(entry.port)"
              >
                解除
              </button>
            </div>
          </div>
          <p v-else class="text-xs text-gray-400 mb-3">未登録</p>

          <!-- ゲートウェイ状態 (接続中の場合) -->
          <div v-if="bleGw.isConnected.value" class="bg-green-50 rounded-lg p-3 mb-3">
            <div class="flex gap-4 text-xs">
              <span v-if="bleGw.gatewayVersion.value" class="text-green-700">FW: v{{ bleGw.gatewayVersion.value }}</span>
              <span class="flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full" :class="bleGw.thermometerConnected.value ? 'bg-green-500' : 'bg-gray-300'" />
                体温計
              </span>
              <span class="flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full" :class="bleGw.bloodPressureConnected.value ? 'bg-green-500' : 'bg-gray-300'" />
                血圧計
              </span>
            </div>
          </div>

          <!-- 診断ボタン -->
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              :disabled="bleGwTesting || bleGwPorts.length === 0"
              @click="testBleGw"
            >
              {{ bleGwTesting ? '接続テスト中...' : '接続テスト' }}
            </button>
          </div>
          <p v-if="bleGwTestResult" class="text-xs mt-2" :class="bleGwTestResult.includes('失敗') || bleGwTestResult.includes('エラー') ? 'text-red-600' : 'text-green-600'">
            {{ bleGwTestResult }}
          </p>
        </div>
      </div>

      <!-- 説明 -->
      <div class="bg-blue-50 rounded-xl p-4 text-sm text-blue-800">
        <p class="font-medium mb-1">デバイス登録について</p>
        <p class="text-xs text-blue-700">
          ここでデバイスを登録すると、測定画面で自動的に接続されます。
          USB ポートを変更する場合は、古いデバイスを「解除」してから新しいデバイスを追加してください。
        </p>
      </div>
    </template>
  </div>
</template>
