// コンソールから window.switchToDummyCamera() で全videoをシルエット映像に差し替え
// マニュアル用スクリーンショット撮影時に使用
if (import.meta.client) {
  (window as any).switchToDummyCamera = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 720
    const ctx = canvas.getContext('2d')!

    // シルエット描画
    function drawFrame() {
      ctx.fillStyle = '#2d3340'
      ctx.fillRect(0, 0, 720, 720)
      // 頭
      ctx.fillStyle = '#5a6578'
      ctx.beginPath()
      ctx.arc(360, 260, 80, 0, Math.PI * 2)
      ctx.fill()
      // 体
      ctx.beginPath()
      ctx.ellipse(360, 420, 120, 80, 0, 0, Math.PI * 2)
      ctx.fill()
      // 検出枠
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 3
      ctx.strokeRect(80, 60, 560, 600)
    }
    drawFrame()

    const dummyStream = canvas.captureStream(30)
    // 全videoのsrcObjectを差し替え
    document.querySelectorAll('video').forEach((v) => {
      v.srcObject = dummyStream
      v.play()
    })
    console.log('[DummyCamera] switched all video elements to silhouette stream')
  }
}

export function useCamera() {
  const stream = ref<MediaStream | null>(null)
  const videoRef = ref<HTMLVideoElement | null>(null)
  const isActive = ref(false)
  const error = ref<string | null>(null)
  const permissionDenied = ref(false)

  async function start(facingMode: 'user' | 'environment' = 'user', deviceModel?: string | null) {
    error.value = null
    permissionDenied.value = false
    try {
      // 権限状態を事前チェック
      if (navigator.permissions) {
        try {
          const status = await navigator.permissions.query({ name: 'camera' as PermissionName })
          if (status.state === 'denied') {
            permissionDenied.value = true
            error.value = 'カメラの権限が拒否されています。端末の設定からカメラの権限を許可してください'
            throw new DOMException('Permission denied', 'NotAllowedError')
          }
        }
        catch (e) {
          // permissions.query が camera をサポートしない場合は無視して getUserMedia へ
          if (e instanceof DOMException && e.name === 'NotAllowedError') throw e
        }
      }

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      const isKyocera = deviceModel?.includes('TB305') ?? false

      let width = isMobile ? 1280 : 1920
      let height = isMobile ? 720 : 1080
      if (isKyocera) {
        width = 640
        height = 480
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      })
      stream.value = mediaStream
      isActive.value = true

      if (videoRef.value) {
        videoRef.value.srcObject = mediaStream
        await videoRef.value.play()
      }
    }
    catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        permissionDenied.value = true
        error.value = 'カメラの権限が拒否されています。端末の設定からカメラの権限を許可してください'
      }
      else {
        error.value = e instanceof Error ? e.message : 'カメラの起動に失敗しました'
      }
      throw e
    }
  }

  function stop() {
    if (stream.value) {
      stream.value.getTracks().forEach(t => t.stop())
      stream.value = null
    }
    if (videoRef.value) {
      videoRef.value.srcObject = null
    }
    isActive.value = false
  }

  function takeSnapshot(): Blob | null {
    const video = videoRef.value
    if (!video || !isActive.value) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)

    let blob: Blob | null = null
    canvas.toBlob((b) => { blob = b }, 'image/jpeg', 0.85)
    return blob
  }

  async function takeSnapshotAsync(): Promise<Blob | null> {
    const video = videoRef.value
    if (!video || !isActive.value) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)

    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85))
  }

  onUnmounted(() => stop())

  return {
    stream: readonly(stream),
    videoRef,
    isActive: readonly(isActive),
    error: readonly(error),
    permissionDenied: readonly(permissionDenied),
    start,
    stop,
    takeSnapshot,
    takeSnapshotAsync,
  }
}
