import type { Fc1200State, Fc1200Event, MeasurementResult, SensorLifetime, MemoryRecord } from '~/types'
import type { Fc1200WasmSession } from 'fc1200-wasm'
import { initFc1200Wasm, createFc1200Session } from '~/utils/fc1200'

const SERIAL_OPTIONS: SerialOptions = {
  baudRate: 9600,
  dataBits: 8,
  parity: 'none' as ParityType,
  stopBits: 1,
  flowControl: 'none' as FlowControlType,
}

// BLE Gateway の既知 VID:PID（除外用）
const BLE_GW_DEVICES = [
  { vid: 0x1A86 },            // CH340/CH552
  { vid: 0x10C4 },            // CP210x
  { vid: 0x303A },            // Espressif native USB
  { vid: 0x0403, pid: 0x6001 }, // FTDI FT232R (ATOM Lite)
]

function isBleGwPort(info: SerialPortInfo): boolean {
  if (info.usbVendorId === undefined) return false
  return BLE_GW_DEVICES.some(d =>
    d.vid === info.usbVendorId && (d.pid === undefined || d.pid === info.usbProductId),
  )
}

export function useFc1200Serial() {
  const isConnected = ref(false)
  const isWasmReady = ref(false)
  const state = ref<Fc1200State>('idle')
  const error = ref<string | null>(null)
  const result = ref<MeasurementResult | null>(null)
  const sensorLifetime = ref<SensorLifetime | null>(null)
  const memoryRecords = ref<MemoryRecord[]>([])
  const dateUpdateSuccess = ref<boolean | null>(null)

  let port: SerialPort | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let session: Fc1200WasmSession | null = null
  let readLoopActive = false

  function isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  /** 許可済みポートに自動接続（ダイアログなし） */
  async function autoConnect(): Promise<boolean> {
    error.value = null

    if (!isWebSerialSupported()) return false

    try {
      const ports = await navigator.serial.getPorts()
      if (ports.length === 0) return false

      // BLE GW 以外で USB VID があるポートを優先
      port = ports.find(p => {
        const info = p.getInfo()
        return info.usbVendorId !== undefined && !isBleGwPort(info)
      }) ?? null
      if (!port) return false

      await initFc1200Wasm()
      isWasmReady.value = true

      await port.open(SERIAL_OPTIONS)

      session = createFc1200Session()
      state.value = session.state() as Fc1200State

      if (port.readable && port.writable) {
        reader = port.readable.getReader()
        writer = port.writable.getWriter()
        isConnected.value = true
        startReadLoop()
        return true
      }
      else {
        throw new Error('シリアルポートの読み書きストリームが取得できません')
      }
    }
    catch (e) {
      // デバイス未接続 or 別タブで使用中 → 静かに失敗
      if (e instanceof DOMException && (e.name === 'NetworkError' || e.name === 'InvalidStateError')) {
        console.warn('[FC-1200] autoConnect failed:', e.name)
      }
      await cleanup()
      return false
    }
  }

  async function connect(): Promise<void> {
    error.value = null

    if (!isWebSerialSupported()) {
      error.value = 'WebSerial API 非対応ブラウザです。Chrome/Edge をご使用ください'
      return
    }

    try {
      // WASM 初期化
      await initFc1200Wasm()
      isWasmReady.value = true

      // シリアルポート選択 (ブラウザのポートピッカー)
      port = await navigator.serial.requestPort()
      await port.open(SERIAL_OPTIONS)

      // WASM セッション作成
      session = createFc1200Session()
      state.value = session.state() as Fc1200State

      // Reader/Writer 取得
      if (port.readable && port.writable) {
        reader = port.readable.getReader()
        writer = port.writable.getWriter()
        isConnected.value = true
        startReadLoop()
      }
      else {
        throw new Error('シリアルポートの読み書きストリームが取得できません')
      }
    }
    catch (e) {
      // ユーザーがポートピッカーをキャンセル
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        return
      }
      error.value = e instanceof Error ? e.message : 'FC-1200 との接続に失敗しました'
      await cleanup()
    }
  }

  async function startReadLoop(): Promise<void> {
    if (!reader || !session) return
    readLoopActive = true

    try {
      while (readLoopActive) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value || !session) break

        // 受信バイト列を WASM に投入
        const raw = new TextDecoder().decode(value)
        console.log('[FC-1200 RX]', raw.replace(/\r\n/g, '\\r\\n'))

        const events: Fc1200Event[] = session.feed(value)

        if (Array.isArray(events)) {
          for (const event of events) {
            console.log('[FC-1200 Event]', event)
            processEvent(event)
          }
        }

        // 保留中の応答バイトを送信
        await sendPendingResponse()
      }
    }
    catch {
      if (readLoopActive) {
        error.value = 'FC-1200 からの受信中にエラーが発生しました'
      }
    }
    finally {
      readLoopActive = false
    }
  }

  function processEvent(event: Fc1200Event): void {
    switch (event.type) {
      case 'state_changed':
        if (event.to) {
          state.value = event.to
        }
        break

      case 'measurement_result':
        state.value = 'result_received'
        if (event.alcohol_value !== undefined) {
          result.value = {
            employeeId: '',
            alcoholValue: event.alcohol_value,
            resultType: event.result_type ?? 'error',
            deviceUseCount: event.use_count ?? 0,
            measuredAt: new Date(),
          }
        }
        break

      case 'usage_time':
        sensorLifetime.value = {
          totalSeconds: event.total_seconds ?? 0,
          elapsedDays: event.elapsed_days ?? 0,
        }
        break

      case 'memory_data':
        if (event.id && event.datetime && event.alcohol_value !== undefined) {
          memoryRecords.value.push({
            id: event.id,
            datetime: event.datetime,
            alcoholValue: event.alcohol_value,
          })
        }
        break

      case 'date_update_response':
        dateUpdateSuccess.value = event.success ?? false
        break

      case 'error':
        error.value = getErrorMessage(event.error_code, event.message)
        break
    }
  }

  function getErrorMessage(code?: string, message?: string): string {
    switch (code) {
      case 'MSTO': return '吹きかけタイムアウト：制限時間内に息を検知できませんでした'
      case 'RSERBL': return '吹きかけエラー：正しく息を吹きかけてください'
      default: return message ?? 'FC-1200 でエラーが発生しました'
    }
  }

  async function sendPendingResponse(): Promise<void> {
    if (!writer || !session) return

    let response = session.get_response()
    while (response) {
      await writer.write(response)
      response = session.get_response()
    }
  }

  async function startMeasurement(): Promise<void> {
    if (!session || !isConnected.value) {
      error.value = 'FC-1200 が接続されていません'
      return
    }

    error.value = null
    result.value = null
    session.start_measurement()
    state.value = session.state() as Fc1200State
    await sendPendingResponse()
  }

  /** センサ寿命確認 (RQUT) */
  async function checkSensorLifetime(): Promise<void> {
    if (!session || !isConnected.value) {
      error.value = 'FC-1200 が接続されていません'
      return
    }
    error.value = null
    sensorLifetime.value = null
    session.check_sensor_lifetime()
    await sendPendingResponse()
  }

  /** メモリ取込開始 (RQDD) */
  async function startMemoryRead(): Promise<void> {
    if (!session || !isConnected.value) {
      error.value = 'FC-1200 が接続されていません'
      return
    }
    error.value = null
    memoryRecords.value = []
    session.start_memory_read()
    await sendPendingResponse()
  }

  /** メモリ取込完了 (DDOK — デバイスメモリクリア) */
  async function completeMemoryRead(): Promise<void> {
    if (!session || !isConnected.value) {
      error.value = 'FC-1200 が接続されていません'
      return
    }
    session.complete_memory_read()
    await sendPendingResponse()
  }

  /** デバイス日時更新 (DT) */
  async function updateDeviceDate(datetime?: string): Promise<void> {
    if (!session || !isConnected.value) {
      error.value = 'FC-1200 が接続されていません'
      return
    }
    error.value = null
    dateUpdateSuccess.value = null
    const dt = datetime ?? formatDateForDevice(new Date())
    session.update_date(dt)
    await sendPendingResponse()
  }

  function formatDateForDevice(date: Date): string {
    const yy = String(date.getFullYear()).slice(2)
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const mi = String(date.getMinutes()).padStart(2, '0')
    return `${yy}${mm}${dd}${hh}${mi}`
  }

  function resetSession(): void {
    if (session) {
      session.reset()
      state.value = session.state() as Fc1200State
    }
    result.value = null
    error.value = null
    sensorLifetime.value = null
    memoryRecords.value = []
    dateUpdateSuccess.value = null
  }

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

    if (writer) {
      try { await writer.close() } catch {}
      try { writer.releaseLock() } catch {}
      writer = null
    }

    if (port) {
      try { await port.close() } catch {}
      port = null
    }

    if (session) {
      try { session.free() } catch {}
      session = null
    }

    isConnected.value = false
    state.value = 'idle'
  }

  onUnmounted(() => cleanup())

  return {
    isConnected: readonly(isConnected),
    isWasmReady: readonly(isWasmReady),
    state: readonly(state),
    error: readonly(error),
    result: readonly(result),
    sensorLifetime: readonly(sensorLifetime),
    memoryRecords: readonly(memoryRecords),
    dateUpdateSuccess: readonly(dateUpdateSuccess),
    isWebSerialSupported,
    autoConnect,
    connect,
    disconnect,
    startMeasurement,
    resetSession,
    checkSensorLifetime,
    startMemoryRead,
    completeMemoryRead,
    updateDeviceDate,
  }
}
