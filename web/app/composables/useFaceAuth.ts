import type { FaceAuthResult } from '~/types'
import { saveFaceDescriptor, getFaceDescriptor, getAllDescriptors } from '~/utils/face-db'
import { FACE_MODEL_VERSION } from '~/composables/useFaceDetection'

const THRESHOLD = 0.55

export function useFaceAuth() {
  const { load, detect, getHuman } = useFaceDetection()

  async function register(employeeId: string, video: HTMLVideoElement): Promise<boolean> {
    await load()
    const result = await detect(video)

    if (result.face.length === 0) return false

    const embedding = result.face[0].embedding
    if (!embedding || embedding.length === 0) return false

    await saveFaceDescriptor(employeeId, embedding, 'pending', FACE_MODEL_VERSION)
    return true
  }

  async function verify(employeeId: string, video: HTMLVideoElement): Promise<FaceAuthResult> {
    await load()
    const human = getHuman()!

    const stored = await getFaceDescriptor(employeeId, FACE_MODEL_VERSION)
    if (!stored) {
      return { verified: false, similarity: 0 }
    }

    const result = await detect(video)
    if (result.face.length === 0) {
      return { verified: false, similarity: 0 }
    }

    const embedding = result.face[0].embedding
    if (!embedding || embedding.length === 0) {
      return { verified: false, similarity: 0 }
    }

    const similarity = human.match.similarity(embedding, stored)

    return {
      verified: similarity >= THRESHOLD,
      similarity,
    }
  }

  async function identify(video: HTMLVideoElement): Promise<{ employeeId: string; similarity: number } | null> {
    await load()
    const human = getHuman()!

    const all = await getAllDescriptors(FACE_MODEL_VERSION)
    if (all.length === 0) return null

    const result = await detect(video)
    if (result.face.length === 0) return null

    const embedding = result.face[0].embedding
    if (!embedding || embedding.length === 0) return null

    const descriptors = all.map(r => r.descriptor)
    const match = human.match.find(embedding, descriptors, { threshold: THRESHOLD })

    if (match.index < 0 || match.similarity < THRESHOLD) return null

    return {
      employeeId: all[match.index].employeeId,
      similarity: match.similarity,
    }
  }

  return {
    register,
    verify,
    identify,
  }
}
