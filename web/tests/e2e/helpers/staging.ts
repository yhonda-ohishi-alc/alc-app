const STAGING_API_URL =
  process.env.STAGING_API_URL ||
  'https://rust-alc-api-staging-566bls5vfq-an.a.run.app'

/**
 * staging API が起動するまでリトライ (Cloud Run コールドスタート対応)
 * 最大 2 分間リトライする
 */
export async function wakeUpStaging(): Promise<void> {
  const maxRetries = 24
  const interval = 5_000

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${STAGING_API_URL}/health`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) return
    } catch {
      // タイムアウトまたは接続エラー — リトライ
    }
    await new Promise(r => setTimeout(r, interval))
  }
  throw new Error('Staging API did not become healthy within 2 minutes')
}

/**
 * テストデータを staging API にインポート
 */
export async function importTestData(data: object): Promise<void> {
  const res = await fetch(`${STAGING_API_URL}/staging/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Import failed: HTTP ${res.status} — ${body}`)
  }
}

/**
 * staging API からデータをエクスポート
 */
export async function exportData(tenantId: string): Promise<object> {
  const res = await fetch(
    `${STAGING_API_URL}/staging/export?tenant_id=${tenantId}`,
  )
  if (!res.ok) {
    throw new Error(`Export failed: HTTP ${res.status}`)
  }
  return res.json()
}
