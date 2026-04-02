export default defineEventHandler(async (event): Promise<unknown> => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  return $fetch(`${config.public.apiBase}/api/devices/fcm-dismiss-test`, {
    method: 'POST',
    body,
  })
})
