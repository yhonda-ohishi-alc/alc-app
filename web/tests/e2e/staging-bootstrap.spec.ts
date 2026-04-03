import { test, expect } from '@playwright/test'
import { wakeUpStaging, importTestData } from './helpers/staging'
import testData from './fixtures/test-data.json'

test.describe('Staging ブートストラップ', () => {
  test.beforeAll(async () => {
    // staging API を起動してテストデータをインポート
    await wakeUpStaging()
    await importTestData(testData)
  })

  test('ホームページが表示される (auth バイパス)', async ({ page }) => {
    await page.goto('/')
    // 測定画面の要素が表示されるまで待機
    await expect(page.locator('body')).toBeVisible()
    // ログインページにリダイレクトされないことを確認
    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('/login')
  })

  test('Staging フッターが表示される', async ({ page }) => {
    await page.goto('/')
    const footer = page.locator('text=STAGING')
    await expect(footer).toBeVisible()
  })

  test('Export ボタンが機能する', async ({ page }) => {
    await page.goto('/')
    const exportButton = page.locator('button:has-text("Export")')
    await expect(exportButton).toBeVisible()

    // ダウンロードを待機
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportButton.click(),
    ])
    expect(download.suggestedFilename()).toContain('staging-export-')
  })

  test('Import ボタンが機能する', async ({ page }) => {
    await page.goto('/')
    const importButton = page.locator('button:has-text("Import")')
    await expect(importButton).toBeVisible()
  })
})
