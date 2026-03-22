export function useManagerAuth() {
  const authenticatedManagerId = useState<string | null>('manager-auth-id', () => null)
  return {
    authenticatedManagerId,
    setManagerId: (id: string | null) => {
      console.log('[useManagerAuth] setManagerId:', id, '→', authenticatedManagerId.value)
      authenticatedManagerId.value = id
      // Android SharedPreferences に永続化
      if (import.meta.client) {
        try { (window as any).AndroidBridge?.setManagerId?.(id || '') } catch {}
      }
    },
    /** 通話応答時に Android SharedPreferences から復元 */
    loadFromDevice: () => {
      if (!import.meta.client) return
      try {
        const id = (window as any).AndroidBridge?.getManagerId?.()
        if (id) {
          authenticatedManagerId.value = id
          console.log('[useManagerAuth] loadFromDevice:', id)
        }
      }
      catch {}
    },
  }
}
