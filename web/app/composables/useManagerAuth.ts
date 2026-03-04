export function useManagerAuth() {
  const authenticatedManagerId = useState<string | null>('manager-auth-id', () => null)
  return {
    authenticatedManagerId,
    setManagerId: (id: string | null) => {
      console.log('[useManagerAuth] setManagerId:', id, '→', authenticatedManagerId.value)
      authenticatedManagerId.value = id
    },
  }
}
