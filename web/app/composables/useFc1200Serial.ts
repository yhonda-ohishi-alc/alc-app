import type { Fc1200State, Fc1200Event, MeasurementResult } from '~/types'
import type { Fc1200WasmSession } from 'fc1200-wasm'
import { initFc1200Wasm, createFc1200Session } from '~/utils/fc1200'

const SERIAL_OPTIONS: SerialOptions = {
  baudRate: 9600,
  dataBits: 8,
  parity: 'none' as ParityType,
  stopBits: 1,
  flowControl: 'none' as FlowControlType,
}

export function useFc1200Serial() {
  const isConnected = ref(false)
  const isWasmReady = ref(false)
  const state = ref<Fc1200State>('idle')
  const error = ref<string | null>(null)
  const result = ref<MeasurementResult | null>(null)

  let port: SerialPort | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let session: Fc1200WasmSession | null = null
  let readLoopActive = false

  function isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
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
        const events: Fc1200Event[] = session.feed(value)

        if (Array.isArray(events)) {
          for (const event of events) {
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
        if (event.state) {
          state.value = event.state
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

  function resetSession(): void {
    if (session) {
      session.reset()
      state.value = session.state() as Fc1200State
    }
    result.value = null
    error.value = null
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
    isWebSerialSupported,
    connect,
    disconnect,
    startMeasurement,
    resetSession,
  }
}
