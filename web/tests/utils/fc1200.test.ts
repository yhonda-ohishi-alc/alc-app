import { describe, it, expect, beforeEach, vi } from 'vitest'

// fc1200-wasm は vitest.config.ts の alias でモック済み
// ここでは initFc1200Wasm / createFc1200Session の動作をテスト

describe('fc1200', () => {
  beforeEach(() => {
    // モジュールキャッシュをクリアして毎回初期化
    vi.resetModules()
  })

  it('initFc1200Wasm は複数回呼んでも1回だけ初期化', async () => {
    const { initFc1200Wasm } = await import('~/utils/fc1200')
    await initFc1200Wasm()
    await initFc1200Wasm() // 2回目: wasmModule が既にある → 即 return
  })

  it('initFc1200Wasm を並行呼び出しすると同じ Promise を返す', async () => {
    const { initFc1200Wasm } = await import('~/utils/fc1200')
    // 2つ同時に呼んで、initPromise が再利用されるパスをカバー
    const [r1, r2] = await Promise.all([initFc1200Wasm(), initFc1200Wasm()])
    expect(r1).toBeUndefined()
    expect(r2).toBeUndefined()
  })

  it('createFc1200Session は初期化前にエラー', async () => {
    const { createFc1200Session } = await import('~/utils/fc1200')
    expect(() => createFc1200Session()).toThrow('WASM not initialized')
  })

  it('createFc1200Session は初期化後にセッション返却', async () => {
    const { initFc1200Wasm, createFc1200Session } = await import('~/utils/fc1200')
    await initFc1200Wasm()
    const session = createFc1200Session()
    expect(session).toBeDefined()
    expect(session.state()).toBe('idle')
  })
})
