export default defineEventHandler(async (event): Promise<unknown> => {
  const config = useRuntimeConfig()
  const id = getRouterParam(event, 'id')
  const headers = getHeaders(event)
  return $fetch(`${config.public.apiBase}/api/tenko-call/numbers/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': headers.authorization || '',
      'X-Tenant-ID': headers['x-tenant-id'] || '',
    },
  })
})
