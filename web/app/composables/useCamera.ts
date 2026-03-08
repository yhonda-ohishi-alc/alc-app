export function useCamera() {
  const stream = ref<MediaStream | null>(null)
  const videoRef = ref<HTMLVideoElement | null>(null)
  const isActive = ref(false)
  const error = ref<string | null>(null)
  const permissionDenied = ref(false)

  async function start(facingMode: 'user' | 'environment' = 'user') {
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
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: isMobile ? 1280 : 1920 },
          height: { ideal: isMobile ? 720 : 1080 },
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
