function readFromBridge(): string | null {
  if (!import.meta.client) return null
  try {
    const id = (window as any).AndroidBridge?.getManagerId?.()
    return id || null
  }
  catch { return null }
}

function writeToBridge(id: string | null) {
  if (!import.meta.client) return
  try {
    if (id) {
      (window as any).AndroidBridge?.setManagerId?.(id)
    }
    else {
      (window as any).AndroidBridge?.setManagerId?.('')
    }
  }
  catch { /* ignore */ }
}

export function useManagerAuth() {
  const authenticatedManagerId = useState<string | null>('manager-auth-id', () => readFromBridge())
  return {
    authenticatedManagerId,
    setManagerId: (id: string | null) => {
      console.log('[useManagerAuth] setManagerId:', id, '→', authenticatedManagerId.value)
      authenticatedManagerId.value = id
      writeToBridge(id)
    },
  }
}
