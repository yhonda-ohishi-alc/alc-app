const STORAGE_KEY = 'fingerprint_device_employees'

interface AndroidBridge {
  getDeviceId(): string
  isFingerprintAvailable(): boolean
  requestFingerprint(): void
}

function getAndroid(): AndroidBridge | null {
  const w = window as any
  if (typeof w.Android?.getDeviceId === 'function') return w.Android
  return null
}

/** デバイスID → 認証済み社員IDセットを localStorage で管理 */
function getAuthorizedEmployees(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const map: Record<string, string[]> = JSON.parse(raw)
    const deviceId = getAndroid()?.getDeviceId()
    if (!deviceId) return new Set()
    return new Set(map[deviceId] ?? [])
  } catch {
    return new Set()
  }
}

function saveAuthorizedEmployee(employeeId: string) {
  const android = getAndroid()
  if (!android) return
  const deviceId = android.getDeviceId()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const map: Record<string, string[]> = raw ? JSON.parse(raw) : {}
    const set = new Set(map[deviceId] ?? [])
    set.add(employeeId)
    map[deviceId] = [...set]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch { /* ignore */ }
}

export function useFingerprint() {
  const isAndroidApp = computed(() => !!getAndroid())
  const isFingerprintAvailable = computed(() => getAndroid()?.isFingerprintAvailable() ?? false)

  const deviceId = computed(() => getAndroid()?.getDeviceId() ?? null)

  /** この社員がこの端末で顔認証済みか（指紋認証を許可してよいか） */
  function isEmployeeAuthorized(employeeId: string): boolean {
    return getAuthorizedEmployees().has(employeeId)
  }

  /** 顔認証成功後に呼んで、この端末と社員を紐付け */
  function authorizeEmployee(employeeId: string) {
    saveAuthorizedEmployee(employeeId)
  }

  /** 指紋認証ダイアログを表示 */
  function requestFingerprint() {
    getAndroid()?.requestFingerprint()
  }

  return {
    isAndroidApp,
    isFingerprintAvailable,
    deviceId,
    isEmployeeAuthorized,
    authorizeEmployee,
    requestFingerprint,
  }
}
