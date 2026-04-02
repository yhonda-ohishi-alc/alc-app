export default defineEventHandler(async (event): Promise<unknown> => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  return $fetch(`${config.public.apiBase}/api/tenko-call/register`, {
    method: 'POST',
    body,
  })
})
