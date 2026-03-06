export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  return $fetch(`${config.public.apiBase}/api/tenko-call/tenko`, {
    method: 'POST',
    body,
  })
})
