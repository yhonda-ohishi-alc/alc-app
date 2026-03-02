import type {
  BleGatewayMessage,
  TemperatureReading,
  BloodPressureReading,
} from '~/types'

const SERIAL_OPTIONS: SerialOptions = {
  baudRate: 115200,
  dataBits: 8,
  parity: 'none' as ParityType,
  stopBits: 1,
  flowControl: 'none' as FlowControlType,
}

// ESP32 系 USB Vendor IDs (CH340, CP210x, Espressif)
const ESP_VENDOR_IDS = [0x1A86, 0x10C4, 0x303A]

// シングルトン: 全コンポーネントで共有
const isConnected = ref(false)
const error = ref<string | null>(null)
const thermometerConnected = ref(false)
const bloodPressureConnected = ref(false)
const latestTemperature = ref<TemperatureReading | null>(null)
const latestBloodPressure = ref<BloodPressureReading | null>(null)
const gatewayVersion = ref<string | null>(null)

let port: SerialPort | null = null
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
let readLoopActive = false
let lineBuffer = ''

export function useBleGateway() {

  function isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  /** ブラウザのポートピッカーで手動接続 */
  async function connect(): Promise<void> {
    error.value = null

    if (!isWebSerialSupported()) {
      error.value = 'WebSerial API 非対応ブラウザです。Chrome/Edge をご使用ください'
      return
    }

    try {
      port = await navigator.serial.requestPort()
      await port.open(SERIAL_OPTIONS)

      if (port.readable) {
        reader = port.readable.getReader()
        isConnected.value = true
        startReadLoop()
      }
      else {
        throw new Error('シリアルポートの読み取りストリームが取得できません')
      }
    }
    catch (e) {
      // ユーザーがポートピッカーをキャンセル
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        return
      }
      error.value = e instanceof Error ? e.message : 'BLE ゲートウェイへの接続に失敗しました'
      await cleanup()
    }
  }

  /** 許可済みポートに自動接続（リトライ付き） */
  async function autoConnect(): Promise<boolean> {
    if (!isWebSerialSupported()) return false
    if (isConnected.value) return true

    const MAX_RETRIES = 3
    const RETRY_DELAY = 500

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const ports = await navigator.serial.getPorts()
        console.log('[BLE-GW] getPorts:', ports.map(p => {
          const info = p.getInfo()
          return { vid: info.usbVendorId?.toString(16), pid: info.usbProductId?.toString(16) }
        }))

        // VID マッチを優先、なければ許可済みポートの先頭を使う
        const candidate = ports.find((p) => {
          const info = p.getInfo()
          return info.usbVendorId !== undefined && ESP_VENDOR_IDS.includes(info.usbVendorId)
        }) ?? (ports.length === 1 ? ports[0] : null)
        if (!candidate) return false

        port = candidate
        await port.open(SERIAL_OPTIONS)

        if (port.readable) {
          reader = port.readable.getReader()
          isConnected.value = true
          startReadLoop()
          return true
        }
        return false
      }
      catch (e) {
        console.warn('[BLE-GW] autoConnect attempt', attempt + 1, 'failed:', e)
        // InvalidStateError = ポートがまだ開いている (前回の close 完了待ち)
        if (e instanceof DOMException && e.name === 'InvalidStateError' && attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAY))
          continue
        }
        await cleanup()
        return false
      }
    }
    return false
  }

  async function startReadLoop(): Promise<void> {
    if (!reader) return
    readLoopActive = true
    const decoder = new TextDecoder()

    try {
      while (readLoopActive) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue

        lineBuffer += decoder.decode(value, { stream: true })

        // 改行区切りで JSON を処理
        let newlineIdx: number
        while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
          const line = lineBuffer.substring(0, newlineIdx).trim()
          lineBuffer = lineBuffer.substring(newlineIdx + 1)
          if (line) {
            processLine(line)
          }
        }
      }
    }
    catch {
      if (readLoopActive) {
        error.value = 'BLE ゲートウェイからの受信中にエラーが発生しました'
      }
    }
    finally {
      readLoopActive = false
    }
  }

  function processLine(line: string): void {
    try {
      const msg = JSON.parse(line) as BleGatewayMessage
      console.log('[BLE-GW RX]', msg)
      processMessage(msg)
    }
    catch {
      console.warn('[BLE-GW] Invalid JSON:', line)
    }
  }

  function processMessage(msg: BleGatewayMessage): void {
    switch (msg.type) {
      case 'ready':
        gatewayVersion.value = msg.version
        break

      case 'connected':
        if (msg.device === 'thermometer') thermometerConnected.value = true
        if (msg.device === 'blood_pressure') bloodPressureConnected.value = true
        break

      case 'disconnected':
        if (msg.device === 'thermometer') thermometerConnected.value = false
        if (msg.device === 'blood_pressure') bloodPressureConnected.value = false
        break

      case 'temperature':
        latestTemperature.value = {
          value: msg.value,
          unit: 'celsius',
          measuredAt: new Date(),
        }
        break

      case 'blood_pressure':
        latestBloodPressure.value = {
          systolic: msg.systolic,
          diastolic: msg.diastolic,
          pulse: msg.pulse && msg.pulse > 0 ? msg.pulse : undefined,
          unit: 'mmHg',
          measuredAt: new Date(),
        }
        break

      case 'error':
        error.value = msg.message
        break
    }
  }

  /** 測定値をクリア（BLE ステップ突入時に呼ぶ） */
  function clearReadings(): void {
    latestTemperature.value = null
    latestBloodPressure.value = null
    error.value = null
  }

  const hasMedicalData = computed(() =>
    latestTemperature.value !== null || latestBloodPressure.value !== null,
  )

  async function disconnect(): Promise<void> {
    await cleanup()
  }

  async function cleanup(): Promise<void> {
    readLoopActive = false

    if (reader) {
      try { await reader.cancel() } catch {}
      try { reader.releaseLock() } catch {}
      reader = null
    }

    if (port) {
      try { await port.close() } catch {}
      port = null
    }

    isConnected.value = false
    thermometerConnected.value = false
    bloodPressureConnected.value = false
    lineBuffer = ''
  }

  return {
    isConnected: readonly(isConnected),
    error: readonly(error),
    thermometerConnected: readonly(thermometerConnected),
    bloodPressureConnected: readonly(bloodPressureConnected),
    latestTemperature: readonly(latestTemperature),
    latestBloodPressure: readonly(latestBloodPressure),
    gatewayVersion: readonly(gatewayVersion),
    hasMedicalData,
    isWebSerialSupported,
    connect,
    autoConnect,
    disconnect,
    clearReadings,
  }
}
