import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAuth } from '~/composables/useAuth'

const mockFetch = vi.fn()

// useAuth はシングルトン state を使うため、テスト間でリセットする
function resetAuthState() {
  const auth = useAuth()
  // 内部 state をリセット (logout + deactivate)
  if (auth.isAuthenticated.value) {
    // logout はfetch を呼ぶので、それを許可
    mockFetch.mockResolvedValueOnce({ ok: true })
  }
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    localStorage.clear()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('device activation', () => {
    it('should activate device and store tenant_id in localStorage', () => {
      const { activateDevice, deviceTenantId, isDeviceActivated } = useAuth()

      activateDevice('tenant-123')

      expect(deviceTenantId.value).toBe('tenant-123')
      expect(isDeviceActivated.value).toBe(true)
      expect(localStorage.getItem('alc_device_tenant_id')).toBe('tenant-123')
    })

    it('should deactivate device and clear localStorage', () => {
      const { activateDevice, deactivateDevice, deviceTenantId, isDeviceActivated } = useAuth()

      activateDevice('tenant-123')
      deactivateDevice()

      expect(deviceTenantId.value).toBeNull()
      expect(isDeviceActivated.value).toBe(false)
      expect(localStorage.getItem('alc_device_tenant_id')).toBeNull()
    })
  })

  describe('token refresh', () => {
    it('should call /api/auth/refresh and update access token', async () => {
      const fakeJwt = createFakeJwt({
        sub: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        tenant_id: 'tenant-1',
        role: 'admin',
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: fakeJwt,
          expires_in: 3600,
        }),
      })

      const { refreshAccessToken, accessToken, user } = useAuth()
      await refreshAccessToken('rt_test-refresh-token')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh_token: 'rt_test-refresh-token' }),
        }),
      )
      expect(accessToken.value).toBe(fakeJwt)
      expect(user.value?.email).toBe('test@example.com')
    })

    it('should throw when refresh fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const { refreshAccessToken } = useAuth()
      await expect(refreshAccessToken('rt_expired')).rejects.toThrow()
    })
  })

  describe('logout', () => {
    it('should clear access token but keep device tenant', async () => {
      const { activateDevice, logout, accessToken, deviceTenantId, isAuthenticated } = useAuth()

      // まず端末をアクティベート
      activateDevice('tenant-abc')

      // ログアウト (API コールは失敗しても OK)
      mockFetch.mockResolvedValueOnce({ ok: true })
      await logout()

      expect(accessToken.value).toBeNull()
      expect(isAuthenticated.value).toBe(false)
      // 端末の tenant_id は保持される
      expect(deviceTenantId.value).toBe('tenant-abc')
      expect(localStorage.getItem('alc_device_tenant_id')).toBe('tenant-abc')
      // refresh token は削除される
      expect(localStorage.getItem('alc_refresh_token')).toBeNull()
    })
  })
})

/** テスト用の偽 JWT を生成 (署名なし) */
function createFakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const sig = 'fake-signature'
  return `${header}.${body}.${sig}`
}
