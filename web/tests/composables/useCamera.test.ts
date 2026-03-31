import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCamera } from '~/composables/useCamera'

describe('useCamera', () => {
  let mockGetUserMedia: ReturnType<typeof vi.fn>
  let mockTrackStop: ReturnType<typeof vi.fn>

  function createMockStream() {
    mockTrackStop = vi.fn()
    return {
      getTracks: () => [{ stop: mockTrackStop }],
    } as unknown as MediaStream
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserMedia = vi.fn()

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
      configurable: true,
      writable: true,
    })
  })

  describe('start', () => {
    it('デスクトップ解像度 (1920x1080)', async () => {
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows)', configurable: true })
      mockGetUserMedia.mockResolvedValue(createMockStream())

      const cam = useCamera()
      await cam.start()

      expect(mockGetUserMedia).toHaveBeenCalledWith(expect.objectContaining({
        video: expect.objectContaining({ width: { ideal: 1920 }, height: { ideal: 1080 } }),
      }))
      expect(cam.isActive.value).toBe(true)
    })

    it('モバイル解像度 (1280x720)', async () => {
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14)', configurable: true })
      mockGetUserMedia.mockResolvedValue(createMockStream())

      const cam = useCamera()
      await cam.start()

      expect(mockGetUserMedia).toHaveBeenCalledWith(expect.objectContaining({
        video: expect.objectContaining({ width: { ideal: 1280 }, height: { ideal: 720 } }),
      }))
    })

    it('Kyocera TB305 は 640x480', async () => {
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14)', configurable: true })
      mockGetUserMedia.mockResolvedValue(createMockStream())

      const cam = useCamera()
      await cam.start('user', 'TB305-device')

      expect(mockGetUserMedia).toHaveBeenCalledWith(expect.objectContaining({
        video: expect.objectContaining({ width: { ideal: 640 }, height: { ideal: 480 } }),
      }))
    })

    it('deviceModel が null でも動く', async () => {
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows)', configurable: true })
      mockGetUserMedia.mockResolvedValue(createMockStream())

      const cam = useCamera()
      await cam.start('user', null)
      expect(cam.isActive.value).toBe(true)
    })

    it('permissions.query denied → エラー + throw', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
        configurable: true,
      })

      const cam = useCamera()
      await expect(cam.start()).rejects.toThrow()
      expect(cam.permissionDenied.value).toBe(true)
      expect(cam.error.value).toContain('カメラの権限')
    })

    it('permissions.query 非対応 → getUserMedia へ進む', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: { query: vi.fn().mockRejectedValue(new TypeError('not supported')) },
        configurable: true,
      })
      mockGetUserMedia.mockResolvedValue(createMockStream())

      const cam = useCamera()
      await cam.start()
      expect(cam.isActive.value).toBe(true)
    })

    it('getUserMedia NotAllowedError → permissionDenied', async () => {
      mockGetUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))

      const cam = useCamera()
      await expect(cam.start()).rejects.toThrow()
      expect(cam.permissionDenied.value).toBe(true)
    })

    it('getUserMedia 一般エラー', async () => {
      mockGetUserMedia.mockRejectedValue(new Error('Device not found'))

      const cam = useCamera()
      await expect(cam.start()).rejects.toThrow('Device not found')
      expect(cam.error.value).toBe('Device not found')
      expect(cam.permissionDenied.value).toBe(false)
    })

    it('非 Error throw', async () => {
      mockGetUserMedia.mockRejectedValue('unknown')

      const cam = useCamera()
      await expect(cam.start()).rejects.toBe('unknown')
      expect(cam.error.value).toBe('カメラの起動に失敗しました')
    })

    it('navigator.permissions undefined', async () => {
      Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true })
      mockGetUserMedia.mockResolvedValue(createMockStream())

      const cam = useCamera()
      await cam.start()
      expect(cam.isActive.value).toBe(true)
    })

    it('videoRef 設定済みなら srcObject + play', async () => {
      mockGetUserMedia.mockResolvedValue(createMockStream())
      const cam = useCamera()
      const mockVideo = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) } as any
      cam.videoRef.value = mockVideo

      await cam.start()
      expect(mockVideo.srcObject).toBeTruthy()
      expect(mockVideo.play).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('トラック停止 + 状態リセット', async () => {
      mockGetUserMedia.mockResolvedValue(createMockStream())
      const cam = useCamera()
      await cam.start()
      cam.stop()

      expect(mockTrackStop).toHaveBeenCalled()
      expect(cam.isActive.value).toBe(false)
      expect(cam.stream.value).toBeNull()
    })

    it('videoRef の srcObject クリア', async () => {
      mockGetUserMedia.mockResolvedValue(createMockStream())
      const cam = useCamera()
      cam.videoRef.value = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) } as any
      await cam.start()
      cam.stop()
      expect(cam.videoRef.value!.srcObject).toBeNull()
    })

    it('未開始でも安全', () => {
      useCamera().stop()
    })
  })

  describe('takeSnapshot', () => {
    it('videoRef なしで null', () => {
      expect(useCamera().takeSnapshot()).toBeNull()
    })

    it('未起動で null', async () => {
      mockGetUserMedia.mockResolvedValue(createMockStream())
      const cam = useCamera()
      await cam.start()
      expect(cam.takeSnapshot()).toBeNull()
    })
  })

  describe('takeSnapshotAsync', () => {
    it('videoRef なしで null', async () => {
      expect(await useCamera().takeSnapshotAsync()).toBeNull()
    })
  })

  it('switchToDummyCamera が window に存在する', () => {
    expect(typeof (window as any).switchToDummyCamera).toBe('function')
  })
})
