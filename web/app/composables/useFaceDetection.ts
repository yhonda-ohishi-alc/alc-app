import Human from '@vladmandic/human'
import { humanConfig } from '~/utils/human-config'

let humanInstance: Human | null = null

export function useFaceDetection() {
  const isReady = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    if (humanInstance && isReady.value) return humanInstance
    if (isLoading.value) return null

    isLoading.value = true
    error.value = null

    try {
      humanInstance = new Human(humanConfig)
      await humanInstance.load()
      await humanInstance.warmup()
      isReady.value = true
      return humanInstance
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : '顔検出モデルの読み込みに失敗しました'
      throw e
    }
    finally {
      isLoading.value = false
    }
  }

  async function detect(video: HTMLVideoElement) {
    if (!humanInstance) throw new Error('Human not loaded')
    const result = await humanInstance.detect(video)
    return result
  }

  function getHuman() {
    return humanInstance
  }

  return {
    isReady: readonly(isReady),
    isLoading: readonly(isLoading),
    error: readonly(error),
    load,
    detect,
    getHuman,
  }
}
