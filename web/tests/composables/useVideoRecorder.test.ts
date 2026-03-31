import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withSetup } from '../helpers/with-setup'
import { useVideoRecorder } from '~/composables/useVideoRecorder'

// MediaRecorder モック
class MockMediaRecorder {
  state = 'inactive' as 'inactive' | 'recording'
  ondataavailable: ((e: any) => void) | null = null
  onstop: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null

  static isTypeSupported = vi.fn(() => true)

  constructor(_stream: any, _options: any) {}

  start(_timeslice?: number) {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    // ondataavailable を先に呼ぶ
    this.ondataavailable?.({ data: new Blob(['test-data'], { type: 'video/webm' }) })
    this.onstop?.(new Event('stop'))
  }
}

describe('useVideoRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
  })

  it('初期値が正しい', () => {
    const { isRecording, recordedBlob, error } = useVideoRecorder()
    expect(isRecording.value).toBe(false)
    expect(recordedBlob.value).toBeNull()
    expect(error.value).toBeNull()
  })

  it('startRecording で録画開始', () => {
    const { startRecording, isRecording } = useVideoRecorder()
    const stream = {} as MediaStream
    startRecording(stream)
    expect(isRecording.value).toBe(true)
  })

  it('stopRecording で Blob が返る', async () => {
    const { startRecording, stopRecording } = useVideoRecorder()
    startRecording({} as MediaStream)
    const blob = await stopRecording()
    expect(blob).toBeInstanceOf(Blob)
  })

  it('stopRecording を録画前に呼んでも null', async () => {
    const { stopRecording } = useVideoRecorder()
    const blob = await stopRecording()
    expect(blob).toBeNull()
  })

  it('MediaRecorder 初期化失敗でエラー', () => {
    vi.stubGlobal('MediaRecorder', class {
      static isTypeSupported = vi.fn(() => true)
      constructor() { throw new Error('Not supported') }
    })

    const { startRecording, error, isRecording } = useVideoRecorder()
    startRecording({} as MediaStream)
    expect(error.value).toBe('録画の開始に失敗しました')
    expect(isRecording.value).toBe(false)
  })

  it('MediaRecorder onerror でエラー設定', () => {
    let capturedRecorder: any = null
    vi.stubGlobal('MediaRecorder', class {
      state = 'inactive' as string
      ondataavailable: any = null
      onstop: any = null
      onerror: any = null
      static isTypeSupported = vi.fn(() => true)
      constructor() { capturedRecorder = this }
      start() { this.state = 'recording' }
      stop() { this.state = 'inactive'; this.onstop?.(new Event('stop')) }
    })

    const { startRecording, error, isRecording } = useVideoRecorder()
    startRecording({} as MediaStream)
    expect(isRecording.value).toBe(true)

    // onerror を直接トリガー
    capturedRecorder.onerror()
    expect(error.value).toBe('録画中にエラーが発生しました')
    expect(isRecording.value).toBe(false)
  })

  it('isTypeSupported が false なら video/webm にフォールバック', () => {
    MockMediaRecorder.isTypeSupported.mockReturnValue(false)
    const { startRecording, isRecording } = useVideoRecorder()
    startRecording({} as MediaStream)
    expect(isRecording.value).toBe(true)
  })

  it('onUnmounted で録画中なら stop', () => {
    const [result, app] = withSetup(() => useVideoRecorder())
    result.startRecording({} as MediaStream)
    expect(result.isRecording.value).toBe(true)

    app.unmount()
    // onUnmounted で stop が呼ばれる
    expect(result.isRecording.value).toBe(false)
  })

  it('ondataavailable で size=0 のデータは無視', async () => {
    vi.stubGlobal('MediaRecorder', class {
      state = 'inactive' as string
      ondataavailable: any = null
      onstop: any = null
      onerror: any = null
      static isTypeSupported = vi.fn(() => true)
      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        // size=0 のデータ
        this.ondataavailable?.({ data: { size: 0 } })
        // 有効なデータ
        this.ondataavailable?.({ data: new Blob(['real-data'], { type: 'video/webm' }) })
        this.onstop?.(new Event('stop'))
      }
    })

    const { startRecording, stopRecording, recordedBlob } = useVideoRecorder()
    startRecording({} as MediaStream)
    await stopRecording()
    expect(recordedBlob.value).toBeInstanceOf(Blob)
  })
})
