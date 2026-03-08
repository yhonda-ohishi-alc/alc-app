export function useAndroidLandscape() {
  const { isAndroidApp } = useFingerprint()
  const isLandscape = ref(false)

  onMounted(() => {
    const mql = window.matchMedia('(orientation: landscape)')
    isLandscape.value = mql.matches
    const handler = (e: MediaQueryListEvent) => { isLandscape.value = e.matches }
    mql.addEventListener('change', handler)
    onUnmounted(() => mql.removeEventListener('change', handler))
  })

  const isAndroidLandscape = computed(() => isAndroidApp.value && isLandscape.value)
  return { isAndroidLandscape }
}
