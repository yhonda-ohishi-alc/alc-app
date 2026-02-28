import type { AuthUser, AuthResponse, RefreshResponse } from '~/types'

const REFRESH_TOKEN_KEY = 'alc_refresh_token'
const DEVICE_TENANT_KEY = 'alc_device_tenant_id'

// シングルトン state (composable の外で定義して複数コンポーネント間で共有)
const user = ref<AuthUser | null>(null)
const accessToken = ref<string | null>(null)
const isLoading = ref(true)
// モジュールロード時に即座に復元 (子コンポーネントの onMounted が app.vue の init() より先に走るため)
const deviceTenantId = ref<string | null>(
  typeof window !== 'undefined' ? localStorage.getItem(DEVICE_TENANT_KEY) : null,
)

let initialized = false
let refreshTimerId: ReturnType<typeof setTimeout> | null = null

export function useAuth() {
  const config = useRuntimeConfig()
  const apiBase = (config.public.apiBase as string).replace(/\/$/, '')

  const isAuthenticated = computed(() => !!accessToken.value)
  const isDeviceActivated = computed(() => !!deviceTenantId.value)

  /** アプリ起動時に呼ぶ: localStorage から復元 + token refresh 試行 */
  async function init() {
    if (initialized) return
    initialized = true

    // deviceTenantId はモジュールスコープで既に復元済み

    // Refresh token があれば自動ログイン試行
    const refreshToken = typeof window !== 'undefined'
      ? localStorage.getItem(REFRESH_TOKEN_KEY)
      : null

    if (refreshToken) {
      try {
        await refreshAccessToken(refreshToken)
      } catch {
        // Refresh 失敗 — トークンをクリア
        if (typeof window !== 'undefined') {
          localStorage.removeItem(REFRESH_TOKEN_KEY)
        }
      }
    }

    isLoading.value = false
  }

  /** Google OAuth ログイン */
  async function loginWithGoogle(): Promise<void> {
    const { $googleAuthReady } = useNuxtApp()
    const ready = await ($googleAuthReady as Promise<boolean>)
    if (!ready || !window.google) {
      throw new Error('Google 認証の初期化に失敗しました')
    }

    const clientId = config.public.googleClientId as string

    return new Promise((resolve, reject) => {
      window.google!.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            await exchangeGoogleToken(response.credential)
            resolve()
          } catch (e) {
            reject(e)
          }
        },
      })
      window.google!.accounts.id.prompt()
    })
  }

  /** Google ID token をバックエンドと交換して App JWT を取得 */
  async function exchangeGoogleToken(idToken: string): Promise<void> {
    const res = await fetch(`${apiBase}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`ログイン失敗 (${res.status}): ${body}`)
    }

    const data: AuthResponse = await res.json()
    setTokens(data)
  }

  /** Refresh token で access token を更新 */
  async function refreshAccessToken(refreshToken?: string): Promise<void> {
    const token = refreshToken || (typeof window !== 'undefined' ? localStorage.getItem(REFRESH_TOKEN_KEY) : null)
    if (!token) throw new Error('Refresh token がありません')

    const res = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token }),
    })

    if (!res.ok) {
      throw new Error('Token refresh に失敗しました')
    }

    const data: RefreshResponse = await res.json()
    accessToken.value = data.access_token

    // access token からユーザー情報をデコード (JWT payload)
    try {
      const parts = data.access_token.split('.')
      if (!parts[1]) throw new Error('Invalid JWT')
      const payload = JSON.parse(atob(parts[1]))
      user.value = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        tenant_id: payload.tenant_id,
        role: payload.role,
      }
    } catch {
      // デコード失敗してもログイン状態は維持
    }

    scheduleAutoRefresh()
  }

  /** トークンをセットして state を更新 */
  function setTokens(data: AuthResponse) {
    accessToken.value = data.access_token
    user.value = data.user

    if (typeof window !== 'undefined') {
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
    }

    // 初回ログイン時に端末をアクティベート
    if (data.user.tenant_id) {
      activateDevice(data.user.tenant_id)
    }

    scheduleAutoRefresh()
  }

  /** JWT の exp から逆算して期限前に自動リフレッシュをスケジュール */
  function scheduleAutoRefresh() {
    if (refreshTimerId) {
      clearTimeout(refreshTimerId)
      refreshTimerId = null
    }

    const token = accessToken.value
    if (!token) return

    try {
      const parts = token.split('.')
      if (!parts[1]) return
      const payload = JSON.parse(atob(parts[1]))
      if (!payload.exp) return

      const expiresAt = payload.exp * 1000
      const now = Date.now()
      // 期限の60秒前にリフレッシュ
      const refreshIn = expiresAt - now - 60_000

      if (refreshIn <= 0) {
        // 既に期限切れ or 間もなく切れる → 即リフレッシュ
        refreshAccessToken().catch(() => {})
        return
      }

      refreshTimerId = setTimeout(() => {
        refreshAccessToken().catch(() => {})
      }, refreshIn)
    } catch {
      // JWT デコードエラー
    }
  }

  /** ログアウト (端末の tenant_id は保持) */
  async function logout() {
    // タイマーをクリア
    if (refreshTimerId) {
      clearTimeout(refreshTimerId)
      refreshTimerId = null
    }

    // バックエンドの refresh token を無効化
    if (accessToken.value) {
      try {
        await fetch(`${apiBase}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken.value}` },
        })
      } catch {
        // ログアウト API 失敗しても続行
      }
    }

    accessToken.value = null
    user.value = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem(REFRESH_TOKEN_KEY)
    }
    // deviceTenantId は意図的に保持 (キオスクモード継続)
  }

  /** 端末をテナントにアクティベート */
  function activateDevice(tenantId: string) {
    deviceTenantId.value = tenantId
    if (typeof window !== 'undefined') {
      localStorage.setItem(DEVICE_TENANT_KEY, tenantId)
    }
  }

  /** 端末のアクティベーションを解除 */
  function deactivateDevice() {
    deviceTenantId.value = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem(DEVICE_TENANT_KEY)
    }
  }

  return {
    user: readonly(user),
    accessToken: readonly(accessToken),
    isAuthenticated,
    isLoading: readonly(isLoading),
    deviceTenantId: readonly(deviceTenantId),
    isDeviceActivated,
    init,
    loginWithGoogle,
    refreshAccessToken,
    logout,
    activateDevice,
    deactivateDevice,
  }
}
