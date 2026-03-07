<script setup lang="ts">
import { initApi, checkDeviceRegistrationStatus, approveDeviceByCode } from '~/utils/api'

const config = useRuntimeConfig()
const route = useRoute()
const { isAuthenticated, loginWithGoogleRedirect, user, accessToken, deviceTenantId, refreshAccessToken } = useAuth()

initApi(
  config.public.apiBase as string,
  () => accessToken.value,
  () => deviceTenantId.value,
  () => refreshAccessToken(),
)

const code = computed(() => route.query.code as string || '')
const status = ref<'loading' | 'approving' | 'approved' | 'error'>('loading')
const errorMessage = ref('')
const approvedDeviceId = ref('')

async function doApprove() {
  if (!code.value) {
    status.value = 'error'
    errorMessage.value = '登録コードが指定されていません'
    return
  }

  status.value = 'approving'
  try {
    // まずリクエスト情報を取得
    const info = await checkDeviceRegistrationStatus(code.value)

    if (info.status === 'approved') {
      status.value = 'approved'
      approvedDeviceId.value = info.device_id || ''
      return
    }

    if (info.status === 'expired') {
      status.value = 'error'
      errorMessage.value = 'このQRコードの有効期限が切れています'
      return
    }

    if (info.status !== 'pending') {
      status.value = 'error'
      errorMessage.value = `このリクエストは既に処理済みです (${info.status})`
      return
    }

    // コードで直接承認 (QR一時: tenant_id が NULL でも OK)
    const res = await approveDeviceByCode(code.value)
    status.value = 'approved'
    approvedDeviceId.value = res.device_id
  } catch (e) {
    status.value = 'error'
    errorMessage.value = e instanceof Error ? e.message : '承認に失敗しました'
  }
}

// ログイン済みなら即承認実行
watch(
  () => isAuthenticated.value,
  (authed) => {
    if (authed && code.value && status.value === 'loading') {
      doApprove()
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (!isAuthenticated.value) {
    // 未ログイン → ログインページへリダイレクト (戻り先をセット)
    loginWithGoogleRedirect(`/device-approve?code=${code.value}`)
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
      <h1 class="text-lg font-bold text-gray-800 mb-2">端末登録承認</h1>
      <p class="text-xs text-gray-500 mb-4">端末に表示されたQRコードをスキャンして承認します</p>

      <div v-if="status === 'loading' || status === 'approving'" class="py-8">
        <div class="flex items-center justify-center gap-2 text-blue-600">
          <span class="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <span class="text-sm">{{ status === 'loading' ? 'ログイン確認中...' : '承認処理中...' }}</span>
        </div>
      </div>

      <div v-else-if="status === 'approved'" class="py-8 space-y-3">
        <div class="text-green-600 text-3xl">OK</div>
        <p class="text-sm text-gray-700">端末を承認しました</p>
        <p class="text-xs text-gray-400">承認者: {{ user?.name }}</p>
        <p class="text-xs text-gray-400">このページは閉じて構いません</p>
      </div>

      <div v-else-if="status === 'error'" class="py-8 space-y-3">
        <div class="text-red-600 text-3xl">!</div>
        <p class="text-sm text-red-600">{{ errorMessage }}</p>
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          @click="status = 'loading'; doApprove()"
        >
          再試行
        </button>
      </div>
    </div>
  </div>
</template>
