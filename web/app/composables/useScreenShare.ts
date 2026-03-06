export function useScreenShare() {
  const webRtc = useWebRtc('device')

  const isSharing = ref(false)
  const roomId = ref<string | null>(null)
  const error = ref<string | null>(null)

  const isMuted = ref(false)

  let screenStream: MediaStream | null = null
  let micStream: MediaStream | null = null

  async function startSharing(signalingUrl: string) {
    error.value = null
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' }, audio: false })
    } catch {
      error.value = '画面共有の許可が得られませんでした'
      return
    }

    // ユーザーが共有停止ボタンを押した場合
    const videoTrack = screenStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.onended = () => stopSharing()
    }

    // マイク音声を取得して合成
    let streamToSend: MediaStream = screenStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamToSend = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...micStream.getAudioTracks(),
      ])
    } catch (e) {
      console.warn('[ScreenShare] getUserMedia failed, continuing without mic:', e)
    }

    const id = 'screen-' + crypto.randomUUID()
    roomId.value = id

    const wsUrl = signalingUrl.replace(/^https/, 'wss').replace(/^http:/, 'ws:')
    try {
      await webRtc.connect(wsUrl, id)
      await webRtc.startStreaming(streamToSend)
      isSharing.value = true
    } catch {
      screenStream.getTracks().forEach(t => t.stop())
      screenStream = null
      micStream?.getTracks().forEach(t => t.stop())
      micStream = null
      roomId.value = null
      error.value = 'シグナリングサーバーへの接続に失敗しました'
    }
  }

  function toggleMute() {
    isMuted.value = !isMuted.value

    // Android bridge: OS レベルでマイクミュート
    const android = (window as any).Android
    if (android?.setMicMuted) {
      android.setMicMuted(isMuted.value)
    }

    // Web 標準: track.enabled でミュート
    if (micStream) {
      for (const track of micStream.getAudioTracks()) {
        track.enabled = !isMuted.value
      }
    }
  }

  function stopSharing() {
    screenStream?.getTracks().forEach(t => t.stop())
    screenStream = null
    micStream?.getTracks().forEach(t => t.stop())
    micStream = null
    webRtc.disconnect()
    isSharing.value = false
    roomId.value = null
    isMuted.value = false
  }

  onUnmounted(() => stopSharing())

  return {
    isSharing: readonly(isSharing),
    roomId: readonly(roomId),
    error: readonly(error),
    isPeerConnected: webRtc.isPeerConnected,
    isConnected: webRtc.isConnected,
    isMuted: readonly(isMuted),
    remoteStream: webRtc.remoteStream,
    startSharing,
    stopSharing,
    toggleMute,
  }
}
