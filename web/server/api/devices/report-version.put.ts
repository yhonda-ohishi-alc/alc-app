export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  return $fetch(`${config.public.apiBase}/api/devices/report-version`, {
    method: 'PUT',
    body,
  })
})
