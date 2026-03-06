export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const headers = getHeaders(event)
  return $fetch(`${config.public.apiBase}/api/tenko-call/numbers`, {
    method: 'POST',
    body,
    headers: {
      'Authorization': headers.authorization || '',
      'X-Tenant-ID': headers['x-tenant-id'] || '',
    },
  })
})
