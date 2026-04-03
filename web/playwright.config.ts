import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000, // staging コールドスタートに時間がかかるため
  retries: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.STAGING_APP_URL || 'https://alc-app-staging.m-tama-ramu.workers.dev',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
