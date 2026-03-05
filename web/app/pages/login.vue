<script setup lang="ts">
const { loginWithGoogle, isAuthenticated, isLoading } = useAuth()
const loginError = ref<string | null>(null)
const route = useRoute()
const googleButtonRef = ref<HTMLElement | null>(null)

// 認証済みならリダイレクト (redirect クエリがあればそちらへ、なければ admin タブ)
watch(isAuthenticated, (val) => {
  if (!val) return
  const redirect = route.query.redirect as string
  if (redirect) {
    navigateTo(redirect)
  } else {
    navigateTo({ path: '/', query: { role: 'admin' } })
  }
}, { immediate: true })

// isLoading が false になり googleButtonRef が DOM に現れたらボタンをレンダリング
watch([isLoading, googleButtonRef], async ([loading, el]) => {
  if (loading || !el) return
  try {
    await loginWithGoogle(el)
  } catch (e) {
    loginError.value = e instanceof Error ? e.message : 'ログインに失敗しました'
  }
})
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
    <div class="bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full text-center">
      <h1 class="text-2xl font-bold text-gray-800 mb-2">管理者ログイン</h1>
      <p class="text-sm text-gray-500 mb-6">
        Google アカウントでログインしてください
      </p>

      <div v-if="isLoading" class="text-gray-400 text-sm">
        読み込み中...
      </div>

      <template v-else>
        <div ref="googleButtonRef" class="flex justify-center" />

        <p v-if="loginError" class="mt-4 text-sm text-red-600">
          {{ loginError }}
        </p>
      </template>

      <NuxtLink to="/" class="block mt-6 text-sm text-blue-600 hover:underline">
        測定画面へ戻る
      </NuxtLink>
    </div>
  </div>
</template>
