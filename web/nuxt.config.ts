// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:3001',
      signalingUrl: 'http://localhost:8787',
      tenantId: 'default',
      googleClientId: '',
    },
  },

  nitro: {
    preset: 'cloudflare_pages',
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@vite-pwa/nuxt',
  ],

  vite: {
    optimizeDeps: {
      exclude: ['fc1200-wasm'],
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'アルコールチェッカー',
      short_name: 'ALC',
      theme_color: '#1e40af',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: {
      // ナビゲーションリクエストのオフラインフォールバック
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      // ランタイムキャッシュ戦略
      runtimeCaching: [
        {
          // human.js モデルファイル (CDN)
          urlPattern: /^https:\/\/vladmandic\.github\.io\/human-models\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'human-models',
            expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // API: 測定履歴 (GET) — ネットワーク優先、オフライン時キャッシュ
          urlPattern: /\/api\/measurements(\?.*)?$/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-measurements',
            expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
            cacheableResponse: { statuses: [0, 200] },
            networkTimeoutSeconds: 5,
          },
        },
        {
          // API: 乗務員一覧 (GET)
          urlPattern: /\/api\/employees(\?.*)?$/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-employees',
            expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
            cacheableResponse: { statuses: [0, 200] },
            networkTimeoutSeconds: 5,
          },
        },
        {
          // 顔写真 (Cloud Storage signed URL)
          urlPattern: /storage\.googleapis\.com/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'face-photos',
            expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
  },
})
