<script setup lang="ts">
const { init } = useAuth()

onMounted(async () => {
  await init()
})
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-50 overflow-hidden">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>
