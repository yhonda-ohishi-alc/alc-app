const GITHUB_RELEASES_API = 'https://api.github.com/repos/yhonda-ohishi-alc/rust-nfc-bridge/releases/latest'
const CACHE_DURATION_MS = 30 * 60 * 1000 // 30 minutes

// Module-level cache (shared across component instances, persists for page lifetime)
let cachedLatestVersion: string | null = null
let lastFetchTime = 0

export function useNfcBridgeUpdate() {
  const latestVersion = ref<string | null>(null)

  async function checkLatestVersion(): Promise<string | null> {
    const now = Date.now()

    if (cachedLatestVersion && (now - lastFetchTime) < CACHE_DURATION_MS) {
      latestVersion.value = cachedLatestVersion
      return cachedLatestVersion
    }

    try {
      const response = await fetch(GITHUB_RELEASES_API, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      })

      if (!response.ok) {
        return cachedLatestVersion
      }

      const data = await response.json()
      const tagName: string = data.tag_name ?? ''
      const version = tagName.startsWith('v') ? tagName.slice(1) : tagName

      cachedLatestVersion = version
      lastFetchTime = now
      latestVersion.value = version

      return version
    }
    catch {
      return null
    }
  }

  function isUpdateAvailable(bridgeVersion: string | null): boolean {
    if (!bridgeVersion || !latestVersion.value) return false
    const normalize = (v: string) => v.replace(/^v/, '').trim()
    return normalize(bridgeVersion) !== normalize(latestVersion.value)
  }

  return {
    latestVersion: readonly(latestVersion),
    checkLatestVersion,
    isUpdateAvailable,
  }
}
