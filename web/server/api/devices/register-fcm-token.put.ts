export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  return $fetch(`${config.public.apiBase}/api/devices/register-fcm-token`, {
    method: 'PUT',
    body,
  })
})
