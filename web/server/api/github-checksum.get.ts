export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const url = query.url as string
  if (!url || !url.startsWith('https://github.com/') || !url.endsWith('.sha256')) {
    throw createError({ statusCode: 400, message: 'Invalid URL' })
  }
  const res = await fetch(url)
  if (!res.ok) {
    throw createError({ statusCode: res.status, message: `GitHub returned ${res.status}` })
  }
  return await res.text()
})
