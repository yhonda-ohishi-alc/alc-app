export default defineEventHandler(async (event): Promise<unknown> => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const auth = getHeader(event, 'Authorization') || ''
  return $fetch(`${config.public.apiBase}/api/devices/trigger-update`, {
    method: 'POST',
    body,
    headers: { Authorization: auth },
  })
})
