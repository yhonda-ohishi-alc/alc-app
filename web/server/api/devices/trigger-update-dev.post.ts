export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const secret = getHeader(event, 'X-Internal-Secret') || ''
  return $fetch(`${config.public.apiBase}/api/devices/trigger-update-dev`, {
    method: 'POST',
    body,
    headers: { 'X-Internal-Secret': secret },
  })
})
