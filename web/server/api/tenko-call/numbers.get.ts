export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const headers = getHeaders(event)
  return $fetch(`${config.public.apiBase}/api/tenko-call/numbers`, {
    headers: {
      'Authorization': headers.authorization || '',
      'X-Tenant-ID': headers['x-tenant-id'] || '',
    },
  })
})
