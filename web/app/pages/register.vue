<script setup lang="ts">
const employeeId = ref('')
const registered = ref(false)

function onRegistered() {
  registered.value = true
}

function reset() {
  employeeId.value = ''
  registered.value = false
}
</script>

<template>
  <div class="flex flex-col items-center min-h-screen p-4">
    <header class="w-full max-w-md text-center py-6">
      <h1 class="text-2xl font-bold text-gray-800">顔登録</h1>
    </header>

    <main class="w-full max-w-md flex-1">
      <div v-if="!registered" class="flex flex-col gap-4">
        <div class="bg-white rounded-2xl p-6 shadow-sm">
          <label class="block text-sm font-medium text-gray-700 mb-2">乗務員ID</label>
          <input
            v-model="employeeId"
            type="text"
            placeholder="例: 12345678"
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          >
          <FaceAuth
            v-if="employeeId.trim()"
            :employee-id="employeeId"
            mode="register"
            @registered="onRegistered"
          />
        </div>
      </div>

      <div v-else class="bg-white rounded-2xl p-6 shadow-sm text-center">
        <div class="text-5xl mb-4">&#10003;</div>
        <h2 class="text-lg font-semibold text-green-700 mb-2">登録完了</h2>
        <p class="text-gray-500 mb-6">ID: {{ employeeId }} の顔を登録しました</p>
        <div class="flex gap-3 justify-center">
          <button
            class="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            @click="reset"
          >
            続けて登録
          </button>
          <NuxtLink
            to="/"
            class="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
          >
            測定へ
          </NuxtLink>
        </div>
      </div>
    </main>

    <footer class="w-full max-w-md py-4">
      <div class="flex justify-center">
        <NuxtLink to="/" class="text-blue-600 hover:underline text-sm">
          測定画面へ戻る
        </NuxtLink>
      </div>
    </footer>
  </div>
</template>
