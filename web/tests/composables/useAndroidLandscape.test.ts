import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAndroidLandscape } from '~/composables/useAndroidLandscape'

describe('useAndroidLandscape', () => {
  beforeEach(() => {
    ;(window as any).Android = undefined
  })

  it('初期値は false (onMounted 前)', () => {
    const { isAndroidLandscape } = useAndroidLandscape()
    // onMounted は Vue コンポーネント外では実行されないため初期値のみテスト
    expect(isAndroidLandscape.value).toBe(false)
  })

  it('Android なしでは常に false', () => {
    const { isAndroidLandscape } = useAndroidLandscape()
    expect(isAndroidLandscape.value).toBe(false)
  })
})
