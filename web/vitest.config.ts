import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      include: ['app/**/*.{ts,vue}'],
      exclude: [
        'app/types/**',
        'app/workers/**',
        'app/web-serial.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'app'),
      '#imports': resolve(__dirname, 'tests/mocks/nuxt-imports.ts'),
      'fc1200-wasm': resolve(__dirname, 'tests/mocks/fc1200-wasm.ts'),
    },
  },
})
