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

// BLE Gateway の既知 VID:PID (CH340, CP210x, Espressif, FTDI FT232R)
const BLE_GW_DEVICES = [
  { vid: 0x1A86 },            // CH340/CH552
  { vid: 0x10C4 },            // CP210x
  { vid: 0x303A },            // Espressif native USB
  { vid: 0x0403, pid: 0x6001 }, // FTDI FT232R (ATOM Lite)
]

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

// Reconnection state
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 2000

// Heartbeat state
let lastHeartbeatTime = 0
let heartbeatCheckTimer: ReturnType<typeof setInterval> | null = null
const HEARTBEAT_TIMEOUT = 30000

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

        // VID+PID マッチを優先、なければ許可済みポートの先頭を使う
        const candidate = ports.find((p) => {
          const info = p.getInfo()
          if (info.usbVendorId === undefined) return false
          return BLE_GW_DEVICES.some(d =>
            d.vid === info.usbVendorId && (d.pid === undefined || d.pid === info.usbProductId),
          )
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
      // If we were connected and the loop ended unexpectedly, attempt reconnect
      if (isConnected.value) {
        console.warn('[BLE-GW] Read loop ended, attempting reconnect...')
        await cleanup()
        scheduleReconnect()
      }
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
        reconnectAttempt = 0
        startHeartbeatCheck()
        break

      case 'heartbeat':
        lastHeartbeatTime = Date.now()
        thermometerConnected.value = msg.thermo
        bloodPressureConnected.value = msg.bp
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

  function scheduleReconnect(): void {
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      error.value = 'BLE ゲートウェイへの再接続に失敗しました'
      reconnectAttempt = 0
      return
    }
    const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempt), 30000)
    reconnectAttempt++
    console.log(`[BLE-GW] Reconnect attempt ${reconnectAttempt} in ${delay}ms`)
    reconnectTimer = setTimeout(async () => {
      const success = await autoConnect()
      if (success) {
        reconnectAttempt = 0
      } else {
        scheduleReconnect()
      }
    }, delay)
  }

  function startHeartbeatCheck(): void {
    stopHeartbeatCheck()
    lastHeartbeatTime = Date.now()
    heartbeatCheckTimer = setInterval(() => {
      if (Date.now() - lastHeartbeatTime > HEARTBEAT_TIMEOUT) {
        console.warn('[BLE-GW] Heartbeat timeout, reconnecting...')
        cleanup().then(() => scheduleReconnect())
      }
    }, 10000)
  }

  function stopHeartbeatCheck(): void {
    if (heartbeatCheckTimer) {
      clearInterval(heartbeatCheckTimer)
      heartbeatCheckTimer = null
    }
  }

  /** 初回自動接続（複数回リトライ） */
  async function startAutoConnect(maxAttempts = 5, intervalMs = 3000): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const success = await autoConnect()
      if (success) return true
      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, intervalMs))
      }
    }
    return false
  }

  async function disconnect(): Promise<void> {
    await cleanup()
  }

  async function cleanup(): Promise<void> {
    readLoopActive = false
    stopHeartbeatCheck()
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

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
    startAutoConnect,
    disconnect,
    clearReadings,
  }
}
