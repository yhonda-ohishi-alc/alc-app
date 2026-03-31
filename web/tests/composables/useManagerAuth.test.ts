import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useManagerAuth } from '~/composables/useManagerAuth'

describe('useManagerAuth', () => {
  beforeEach(() => {
    delete (window as any).Android
    // useState のステートをリセット
    const { setManagerId } = useManagerAuth()
    setManagerId(null)
  })

  it('初期値は null', () => {
    const { authenticatedManagerId } = useManagerAuth()
    expect(authenticatedManagerId.value).toBeNull()
  })

  it('setManagerId で値がセットされる', () => {
    const { authenticatedManagerId, setManagerId } = useManagerAuth()
    setManagerId('mgr-001')
    expect(authenticatedManagerId.value).toBe('mgr-001')
  })

  it('setManagerId(null) でクリア', () => {
    const { authenticatedManagerId, setManagerId } = useManagerAuth()
    setManagerId('mgr-001')
    setManagerId(null)
    expect(authenticatedManagerId.value).toBeNull()
  })

  it('Android bridge があれば setManagerId を呼ぶ', () => {
    const mockSetManagerId = vi.fn()
    ;(window as any).Android = { setManagerId: mockSetManagerId }

    const { setManagerId } = useManagerAuth()
    setManagerId('mgr-002')
    expect(mockSetManagerId).toHaveBeenCalledWith('mgr-002')
  })

  it('loadFromDevice で Android から復元', () => {
    ;(window as any).Android = { getManagerId: () => 'restored-mgr' }

    const { authenticatedManagerId, loadFromDevice } = useManagerAuth()
    loadFromDevice()
    expect(authenticatedManagerId.value).toBe('restored-mgr')
  })

  it('loadFromDevice で Android がなくてもエラーにならない', () => {
    const { loadFromDevice } = useManagerAuth()
    loadFromDevice() // no error
  })

  it('loadFromDevice で getManagerId が null なら変更なし', () => {
    Object.defineProperty(window, 'Android', {
      value: { getManagerId: () => null },
      writable: true,
      configurable: true,
    })

    const { authenticatedManagerId, loadFromDevice } = useManagerAuth()
    loadFromDevice()
    expect(authenticatedManagerId.value).toBeNull()
  })
})
