import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNfcBridgeUpdate } from '~/composables/useNfcBridgeUpdate'

describe('useNfcBridgeUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('初期値は null', async () => {
    const mod = await import('~/composables/useNfcBridgeUpdate')
    const { latestVersion } = mod.useNfcBridgeUpdate()
    expect(latestVersion.value).toBeNull()
  })

  it('checkLatestVersion で GitHub API からバージョン取得', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: 'v1.2.3' }),
    }))

    const mod = await import('~/composables/useNfcBridgeUpdate')
    const { checkLatestVersion, latestVersion } = mod.useNfcBridgeUpdate()
    const version = await checkLatestVersion()

    expect(version).toBe('1.2.3')
    expect(latestVersion.value).toBe('1.2.3')
  })

  it('キャッシュが効く (2回目は fetch しない)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: 'v1.0.0' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const mod = await import('~/composables/useNfcBridgeUpdate')
    const { checkLatestVersion } = mod.useNfcBridgeUpdate()
    await checkLatestVersion()
    await checkLatestVersion() // 2回目

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetch 失敗で null を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    const mod = await import('~/composables/useNfcBridgeUpdate')
    const { checkLatestVersion } = mod.useNfcBridgeUpdate()
    const version = await checkLatestVersion()

    expect(version).toBeNull()
  })

  it('response.ok が false ならキャッシュされた値を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const mod = await import('~/composables/useNfcBridgeUpdate')
    const { checkLatestVersion } = mod.useNfcBridgeUpdate()
    const version = await checkLatestVersion()

    expect(version).toBeNull() // キャッシュなしなので null
  })

  it('tag_name が v なしでもそのまま返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: '2.0.0' }),
    }))

    const mod = await import('~/composables/useNfcBridgeUpdate')
    const { checkLatestVersion } = mod.useNfcBridgeUpdate()
    const version = await checkLatestVersion()

    expect(version).toBe('2.0.0')
  })

  it('tag_name が undefined なら空文字', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }))

    const mod = await import('~/composables/useNfcBridgeUpdate')
    const { checkLatestVersion } = mod.useNfcBridgeUpdate()
    const version = await checkLatestVersion()

    expect(version).toBe('')
  })

  it('isUpdateAvailable でバージョン比較', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: 'v1.5.0' }),
    }))

    const mod = await import('~/composables/useNfcBridgeUpdate')
    const { checkLatestVersion, isUpdateAvailable } = mod.useNfcBridgeUpdate()
    await checkLatestVersion()

    expect(isUpdateAvailable('1.4.0')).toBe(true)
    expect(isUpdateAvailable('v1.5.0')).toBe(false)
    expect(isUpdateAvailable('1.5.0')).toBe(false)
    expect(isUpdateAvailable(null)).toBe(false)
  })

  it('isUpdateAvailable で latestVersion が null なら false', () => {
    const { isUpdateAvailable } = useNfcBridgeUpdate()
    expect(isUpdateAvailable('1.0.0')).toBe(false)
  })
})
