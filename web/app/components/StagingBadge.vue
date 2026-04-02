<script setup lang="ts">
const config = useRuntimeConfig()
const route = useRoute()

const apiBase = config.public.apiBase as string
const isStaging = apiBase.includes('staging')

const authMode = computed(() => {
  if (route.query.auth === 'staging') return 'staging'
  return 'production'
})
</script>

<template>
  <div v-if="isStaging" class="fixed bottom-0 left-0 right-0 bg-yellow-500 text-yellow-900 text-xs px-3 py-1 flex items-center justify-between z-50">
    <span>STAGING</span>
    <span>API: {{ apiBase.replace('https://', '').split('.')[0] }}</span>
    <span>Auth: {{ authMode }}</span>
  </div>
</template>
