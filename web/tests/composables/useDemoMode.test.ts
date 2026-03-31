import { describe, it, expect } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useDemoMode } from '~/composables/useDemoMode'

const { useRouteMock } = vi.hoisted(() => ({
  useRouteMock: vi.fn(() => ({ query: {} })),
}))

mockNuxtImport('useRoute', () => useRouteMock)

describe('useDemoMode', () => {
  it('demo=1 なら isDemoMode が true', () => {
    useRouteMock.mockReturnValue({ query: { demo: '1' } })
    const { isDemoMode } = useDemoMode()
    expect(isDemoMode.value).toBe(true)
  })

  it('demo パラメータなしなら false', () => {
    useRouteMock.mockReturnValue({ query: {} })
    const { isDemoMode } = useDemoMode()
    expect(isDemoMode.value).toBe(false)
  })

  it('demo=0 なら false', () => {
    useRouteMock.mockReturnValue({ query: { demo: '0' } })
    const { isDemoMode } = useDemoMode()
    expect(isDemoMode.value).toBe(false)
  })
})
