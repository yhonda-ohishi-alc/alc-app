import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withSetup } from '../helpers/with-setup'
import { useAndroidLandscape } from '~/composables/useAndroidLandscape'

describe('useAndroidLandscape', () => {
  let changeHandler: ((e: { matches: boolean }) => void) | null = null
  const removeListener = vi.fn()

  beforeEach(() => {
    delete (window as any).Android
    changeHandler = null

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: (_event: string, fn: any) => { changeHandler = fn },
        removeEventListener: removeListener,
      })),
    })
  })

  it('Android なしでは常に false', () => {
    const [result, app] = withSetup(() => useAndroidLandscape())
    expect(result.isAndroidLandscape.value).toBe(false)
    app.unmount()
  })

  it('Android + portrait では false', () => {
    ;(window as any).Android = {
      getAndroidId: () => 'dev-001',
      isFingerprintAvailable: () => false,
      requestFingerprint: vi.fn(),
    }

    const [result, app] = withSetup(() => useAndroidLandscape())
    // matchMedia.matches = false (portrait)
    expect(result.isAndroidLandscape.value).toBe(false)
    app.unmount()
  })

  it('Android + landscape では true', () => {
    ;(window as any).Android = {
      getAndroidId: () => 'dev-001',
      isFingerprintAvailable: () => false,
      requestFingerprint: vi.fn(),
    }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: (_event: string, fn: any) => { changeHandler = fn },
        removeEventListener: removeListener,
      })),
    })

    const [result, app] = withSetup(() => useAndroidLandscape())
    expect(result.isAndroidLandscape.value).toBe(true)
    app.unmount()
  })

  it('orientation change イベントで更新', () => {
    ;(window as any).Android = {
      getAndroidId: () => 'dev-001',
      isFingerprintAvailable: () => false,
      requestFingerprint: vi.fn(),
    }

    const [result, app] = withSetup(() => useAndroidLandscape())
    expect(result.isAndroidLandscape.value).toBe(false)

    // orientation が landscape に変わる
    changeHandler?.({ matches: true })
    expect(result.isAndroidLandscape.value).toBe(true)

    // portrait に戻る
    changeHandler?.({ matches: false })
    expect(result.isAndroidLandscape.value).toBe(false)

    app.unmount()
  })

  it('unmount でリスナーが解除される', () => {
    const [_result, app] = withSetup(() => useAndroidLandscape())
    app.unmount()
    expect(removeListener).toHaveBeenCalled()
  })
})
