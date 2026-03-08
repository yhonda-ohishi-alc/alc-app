export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const deviceId = getRouterParam(event, 'deviceId')
  return $fetch(`${config.public.apiBase}/api/devices/settings/${deviceId}`)
})
