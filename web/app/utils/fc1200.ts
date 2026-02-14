let wasmModule: typeof import('fc1200-wasm') | null = null
let initPromise: Promise<void> | null = null

/**
 * Initialize the FC-1200 WASM module.
 * Safe to call multiple times — returns the same promise if already initializing.
 */
export async function initFc1200Wasm(): Promise<void> {
  if (wasmModule) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    const wasm = await import('fc1200-wasm')
    await wasm.default()
    wasmModule = wasm
  })()

  await initPromise
}

/**
 * Create a new FC-1200 protocol session.
 * Must call initFc1200Wasm() first.
 */
export function createFc1200Session() {
  if (!wasmModule) {
    throw new Error('FC-1200 WASM not initialized. Call initFc1200Wasm() first.')
  }
  return wasmModule.create_session()
}
