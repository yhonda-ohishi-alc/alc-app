<script setup lang="ts">
const { init, isLoading } = useAuth()

onMounted(async () => {
  await init()
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <NuxtRouteAnnouncer />
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
    </div>
    <NuxtPage v-else />
  </div>
</template>
