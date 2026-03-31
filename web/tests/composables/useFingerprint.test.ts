import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFingerprint } from '~/composables/useFingerprint'

describe('useFingerprint', () => {
  beforeEach(() => {
    ;(window as any).Android = undefined
    localStorage.clear()
  })

  it('Android なしでは isAndroidApp = false', () => {
    const { isAndroidApp, isFingerprintAvailable, deviceId } = useFingerprint()
    expect(isAndroidApp.value).toBe(false)
    expect(isFingerprintAvailable.value).toBe(false)
    expect(deviceId.value).toBeNull()
  })

  it('Android ありで isAndroidApp = true', () => {
    ;(window as any).Android = {
      getAndroidId: () => 'device-001',
      isFingerprintAvailable: () => true,
      requestFingerprint: vi.fn(),
    }

    const { isAndroidApp, isFingerprintAvailable, deviceId } = useFingerprint()
    expect(isAndroidApp.value).toBe(true)
    expect(isFingerprintAvailable.value).toBe(true)
    expect(deviceId.value).toBe('device-001')
  })

  it('deviceModel は getDeviceModel がなければ null', () => {
    ;(window as any).Android = {
      getAndroidId: () => 'device-001',
      isFingerprintAvailable: () => false,
      requestFingerprint: vi.fn(),
    }

    const { deviceModel } = useFingerprint()
    expect(deviceModel.value).toBeNull()
  })

  it('deviceModel がある場合', () => {
    ;(window as any).Android = {
      getAndroidId: () => 'device-001',
      isFingerprintAvailable: () => false,
      requestFingerprint: vi.fn(),
      getDeviceModel: () => 'Pixel 7',
    }

    const { deviceModel } = useFingerprint()
    expect(deviceModel.value).toBe('Pixel 7')
  })

  it('authorizeEmployee + isEmployeeAuthorized', () => {
    ;(window as any).Android = {
      getAndroidId: () => 'device-001',
      isFingerprintAvailable: () => false,
      requestFingerprint: vi.fn(),
    }

    const { authorizeEmployee, isEmployeeAuthorized } = useFingerprint()

    expect(isEmployeeAuthorized('emp-001')).toBe(false)
    authorizeEmployee('emp-001')
    expect(isEmployeeAuthorized('emp-001')).toBe(true)
    expect(isEmployeeAuthorized('emp-002')).toBe(false)
  })

  it('Android なしでは authorizeEmployee は何もしない', () => {
    const { authorizeEmployee, isEmployeeAuthorized } = useFingerprint()
    authorizeEmployee('emp-001')
    expect(isEmployeeAuthorized('emp-001')).toBe(false)
  })

  it('requestFingerprint は Android bridge を呼ぶ', () => {
    const mockRequest = vi.fn()
    ;(window as any).Android = {
      getAndroidId: () => 'device-001',
      isFingerprintAvailable: () => true,
      requestFingerprint: mockRequest,
    }

    const { requestFingerprint } = useFingerprint()
    requestFingerprint()
    expect(mockRequest).toHaveBeenCalledOnce()
  })

  it('requestFingerprint は Android なしでもエラーにならない', () => {
    const { requestFingerprint } = useFingerprint()
    requestFingerprint() // no error
  })

  it('localStorage が壊れていてもエラーにならない', () => {
    ;(window as any).Android = {
      getAndroidId: () => 'device-001',
      isFingerprintAvailable: () => false,
      requestFingerprint: vi.fn(),
    }

    localStorage.setItem('fingerprint_device_employees', 'invalid-json')
    const { isEmployeeAuthorized } = useFingerprint()
    expect(isEmployeeAuthorized('emp-001')).toBe(false)
  })
})
