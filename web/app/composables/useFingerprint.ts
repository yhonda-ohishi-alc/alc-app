import { isClient } from '~/utils/env'

const STORAGE_KEY = 'fingerprint_device_employees'

interface AndroidBridge {
  getAndroidId(): string
  isFingerprintAvailable(): boolean
  requestFingerprint(): void
  getDeviceModel?(): string
}

function getAndroid(): AndroidBridge | null {
  if (!isClient) return null
  const w = window as any
  if (typeof w.Android?.getAndroidId === 'function') return w.Android
  return null
}

/** デバイスID → 認証済み社員IDセットを localStorage で管理 */
function getAuthorizedEmployees(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const map: Record<string, string[]> = JSON.parse(raw)
    const deviceId = getAndroid()?.getAndroidId()
    if (!deviceId) return new Set()
    return new Set(map[deviceId] ?? [])
  } catch {
    return new Set()
  }
}

function saveAuthorizedEmployee(employeeId: string) {
  const android = getAndroid()
  if (!android) return
  const deviceId = android.getAndroidId()
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

  const deviceId = computed(() => getAndroid()?.getAndroidId() ?? null)
  const deviceModel = computed(() => getAndroid()?.getDeviceModel?.() ?? null)

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
    deviceModel,
    isEmployeeAuthorized,
    authorizeEmployee,
    requestFingerprint,
  }
}
