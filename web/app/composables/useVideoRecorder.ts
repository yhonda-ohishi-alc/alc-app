/**
 * MediaRecorder ラッパー composable
 * アルコール測定時の吹きかけ映像を録画する
 */
export function useVideoRecorder() {
  const isRecording = ref(false)
  const recordedBlob = ref<Blob | null>(null)
  const error = ref<string | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let chunks: BlobPart[] = []

  function startRecording(stream: MediaStream) {
    chunks = []
    recordedBlob.value = null
    error.value = null

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm'

    try {
      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 500_000,
      })
    } catch (e) {
      error.value = '録画の開始に失敗しました'
      console.error('[VideoRecorder] MediaRecorder init failed:', e)
      return
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    mediaRecorder.onstop = () => {
      recordedBlob.value = new Blob(chunks, { type: mimeType })
      isRecording.value = false
    }
    mediaRecorder.onerror = () => {
      error.value = '録画中にエラーが発生しました'
      isRecording.value = false
    }

    mediaRecorder.start(1000)
    isRecording.value = true
    console.log('[VideoRecorder] Recording started')
  }

  function stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(recordedBlob.value)
        return
      }
      const prevOnStop = mediaRecorder.onstop
      mediaRecorder.onstop = (e) => {
        if (prevOnStop) (prevOnStop as (e: Event) => void)(e)
        resolve(recordedBlob.value)
      }
      mediaRecorder.stop()
      console.log('[VideoRecorder] Recording stopped')
    })
  }

  onUnmounted(() => {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop()
    }
  })

  return { isRecording, recordedBlob, error, startRecording, stopRecording }
}
