import type { Config } from '@vladmandic/human'

export const humanConfig: Partial<Config> = {
  backend: 'webgl',
  modelBasePath: 'https://vladmandic.github.io/human-models/models/',
  wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/',
  debug: false,
  cacheSensitivity: 0.75,

  face: {
    enabled: true,
    detector: {
      enabled: true,
      modelPath: 'blazeface-back.json',
      rotation: false,
      maxDetected: 1,
      minConfidence: 0.5,
      return: false,
    },
    mesh: {
      enabled: true,
      modelPath: 'facemesh.json',
    },
    description: {
      enabled: true,
      modelPath: 'faceres.json',
      minConfidence: 0.1,
    },
    iris: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },

  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: true },
  object: { enabled: false },
  segmentation: { enabled: false },
}
