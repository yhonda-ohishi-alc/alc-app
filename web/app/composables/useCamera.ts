export function useCamera() {
  const stream = ref<MediaStream | null>(null)
  const videoRef = ref<HTMLVideoElement | null>(null)
  const isActive = ref(false)
  const error = ref<string | null>(null)

  async function start(facingMode: 'user' | 'environment' = 'user') {
    error.value = null
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
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
      error.value = e instanceof Error ? e.message : 'カメラの起動に失敗しました'
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
    start,
    stop,
    takeSnapshot,
    takeSnapshotAsync,
  }
}
