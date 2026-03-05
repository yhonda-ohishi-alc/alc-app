declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
            auto_select?: boolean
            use_fedcm_for_prompt?: boolean
          }) => void
          prompt: () => void
          renderButton: (element: HTMLElement, config: {
            theme?: string
            size?: string
            width?: number
          }) => void
        }
      }
    }
  }
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const clientId = config.public.googleClientId as string

  if (!clientId) {
    console.warn('[GoogleAuth] NUXT_PUBLIC_GOOGLE_CLIENT_ID が未設定です')
    return { provide: { googleAuthReady: Promise.resolve(false) } }
  }

  const ready = new Promise<boolean>((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve(true)
    script.onerror = () => {
      console.error('[GoogleAuth] GIS スクリプトの読み込みに失敗しました')
      resolve(false)
    }
    document.head.appendChild(script)
  })

  return { provide: { googleAuthReady: ready } }
})
