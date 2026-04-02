import type { FaceAuthResult } from '~/types'
import { saveFaceDescriptor, getFaceDescriptor, getAllDescriptors } from '~/utils/face-db'
import { FACE_MODEL_VERSION } from '~/composables/useFaceDetection'

const THRESHOLD = 0.55

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; normA += a[i]! * a[i]!; normB += b[i]! * b[i]! }
  return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0
}

export function useFaceAuth() {
  const { load, detect } = useFaceDetection()

  async function register(employeeId: string, video: HTMLVideoElement, precomputedEmbedding?: number[]): Promise<boolean> {
    let embedding: number[]

    if (precomputedEmbedding) {
      embedding = precomputedEmbedding
    } else {
      await load()
      const result = await detect(video)
      if (result.face.length === 0) return false
      const emb = result.face[0].embedding
      if (!emb || emb.length === 0) return false
      embedding = emb
    }

    await saveFaceDescriptor(employeeId, embedding, 'approved', FACE_MODEL_VERSION)
    const saved = await getFaceDescriptor(employeeId, FACE_MODEL_VERSION)
    if (!saved || saved.length === 0) {
      console.error('[FaceAuth] register: save verification failed')
      return false
    }
    return true
  }

  async function verify(employeeId: string, video: HTMLVideoElement, precomputedEmbedding?: number[]): Promise<FaceAuthResult> {
    await load()

    const stored = await getFaceDescriptor(employeeId, FACE_MODEL_VERSION)
    if (!stored) {
      console.warn(`[FaceAuth] verify: no stored embedding for ${employeeId.slice(0, 8)} (modelVersion=${FACE_MODEL_VERSION})`)
      return { verified: false, similarity: 0 }
    }

    let embArr: number[]
    if (precomputedEmbedding) {
      embArr = precomputedEmbedding
    } else {
      const result = await detect(video)
      if (result.face.length === 0) return { verified: false, similarity: 0 }
      const embedding = result.face[0].embedding
      if (!embedding || embedding.length === 0) return { verified: false, similarity: 0 }
      embArr = Array.isArray(embedding) ? embedding : Array.from(embedding as any)
    }

    const similarity = cosineSimilarity(embArr, stored)
    console.log(`[FaceAuth] verify: similarity=${similarity.toFixed(4)}`)

    return {
      verified: similarity >= THRESHOLD,
      similarity,
    }
  }

  async function identify(video: HTMLVideoElement): Promise<{ employeeId: string; similarity: number } | null> {
    await load()

    const all = await getAllDescriptors(FACE_MODEL_VERSION)
    if (all.length === 0) return null

    const result = await detect(video)
    if (result.face.length === 0) return null

    const embedding = result.face[0].embedding
    if (!embedding || embedding.length === 0) return null

    const embArr = Array.isArray(embedding) ? embedding : Array.from(embedding as any) as number[]
    let bestIdx = -1, bestSim = 0
    for (let i = 0; i < all.length; i++) {
      const record = all[i]
      if (!record) continue
      const sim = cosineSimilarity(embArr, record.descriptor)
      if (sim > bestSim) { bestSim = sim; bestIdx = i }
    }

    if (bestIdx < 0 || bestSim < THRESHOLD) return null

    return {
      employeeId: all[bestIdx]?.employeeId ?? '',
      similarity: bestSim,
    }
  }

  return {
    register,
    verify,
    identify,
  }
}
