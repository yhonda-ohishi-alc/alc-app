import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    isAuthenticated: { value: true },
    isLoading: { value: false },
  })),
}))
mockNuxtImport('useAuth', () => useAuthMock)

const { navigateToMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
}))
mockNuxtImport('navigateTo', () => navigateToMock)

import authMiddleware from '~/middleware/auth.global'

describe('auth.global middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('測定ページ (/) は認証不要', () => {
    const result = authMiddleware({ path: '/' } as any, {} as any)
    expect(result).toBeUndefined()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('login ページは認証不要', () => {
    const result = authMiddleware({ path: '/login' } as any, {} as any)
    expect(result).toBeUndefined()
  })

  it('/register は認証必須 — 認証済みなら通過', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: { value: true }, isLoading: { value: false } })
    const result = authMiddleware({ path: '/register' } as any, {} as any)
    expect(result).toBeUndefined()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('/register で未認証なら /login にリダイレクト', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: { value: false }, isLoading: { value: false } })
    authMiddleware({ path: '/register' } as any, {} as any)
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('/maintenance で未認証なら /login にリダイレクト', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: { value: false }, isLoading: { value: false } })
    authMiddleware({ path: '/maintenance' } as any, {} as any)
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('isLoading 中はスキップ (リダイレクトしない)', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: { value: false }, isLoading: { value: true } })
    const result = authMiddleware({ path: '/register' } as any, {} as any)
    expect(result).toBeUndefined()
    expect(navigateToMock).not.toHaveBeenCalled()
  })
})
