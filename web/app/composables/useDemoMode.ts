export function useDemoMode() {
  const route = useRoute()
  const isDemoMode = computed(
    () => route.query.demo === '1',
  )
  return { isDemoMode }
}
