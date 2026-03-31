export function useManagerAuth() {
  const authenticatedManagerId = useState<string | null>('manager-auth-id', () => null)
  return {
    authenticatedManagerId,
    setManagerId: (id: string | null) => {
      console.log('[useManagerAuth] setManagerId:', id, '→', authenticatedManagerId.value)
      authenticatedManagerId.value = id
      // Android SharedPreferences に永続化（null時はメモリのみクリア、デバイスには残す）
      if (id) {
        try { (window as any).Android?.setManagerId?.(id) } catch { /* SSR or no bridge */ }
      }
    },
    /** 通話応答時に Android SharedPreferences から復元 */
    loadFromDevice: () => {
      try {
        const id = (window as any).Android?.getManagerId?.()
        if (id) {
          authenticatedManagerId.value = id
          console.log('[useManagerAuth] loadFromDevice:', id)
        }
      }
      catch { /* SSR or no bridge */ }
    },
  }
}
