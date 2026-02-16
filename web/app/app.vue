<script setup lang="ts">
const { init } = useAuth()

onMounted(async () => {
  await init()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
