<script setup lang="ts">
import { initApi } from '~/utils/api'

const config = useRuntimeConfig()
const route = useRoute()

// Auth + API init (全タブ共通)
const { accessToken, deviceTenantId, refreshAccessToken } = useAuth()
initApi(
  config.public.apiBase as string,
  () => accessToken.value,
  () => deviceTenantId.value,
  () => refreshAccessToken(),
)

// 顔データ同期 (singleton)
useFaceSync()

// --- ロールタブ ---
type RoleTab = 'driver' | 'manager' | 'admin'
const roleTabOptions: RoleTab[] = ['driver', 'manager', 'admin']
const activeRole = ref<RoleTab>(
  roleTabOptions.includes(route.query.role as RoleTab)
    ? (route.query.role as RoleTab)
    : 'driver',
)

// --- 運行者サブタブ ---
type DriverSubTab = 'normal' | 'tenko' | 'remote' | 'demo' | 'remote_demo' | 'device'
const driverSubTab = ref<DriverSubTab>(
  route.query.tab === 'tenko' ? 'tenko'
  : route.query.tab === 'demo' ? 'demo'
  : route.query.tab === 'remote' ? 'remote'
  : route.query.tab === 'remote_demo' ? 'remote_demo'
  : route.query.tab === 'device' ? 'device'
  : 'normal',
)

// URL クエリ同期
watch(activeRole, (role) => {
  const query: Record<string, string> = {}
  if (role !== 'driver') query.role = role
  navigateTo({ path: '/', query }, { replace: true })
})

watch(driverSubTab, (tab) => {
  if (activeRole.value !== 'driver') return
  const query: Record<string, string> = {}
  if (tab === 'tenko') query.tab = 'tenko'
  else if (tab === 'demo') query.tab = 'demo'
  else if (tab === 'remote') query.tab = 'remote'
  else if (tab === 'device') query.tab = 'device'
  navigateTo({ path: '/', query }, { replace: true })
})

const roleLabels: Record<RoleTab, string> = {
  driver: '運行者',
  manager: '運行管理者',
  admin: 'システム管理者',
}

// ハンバーガーメニュー
const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)

function onMenuSelect(tab: DriverSubTab) {
  driverSubTab.value = tab
  menuOpen.value = false
}

function onClickOutside(e: Event) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))

// 同タブ再クリックで再認証させるためのキー
const managerAuthKey = ref(0)
const adminAuthKey = ref(0)

function onRoleTabClick(role: RoleTab) {
  if (activeRole.value === role) {
    if (role === 'manager') managerAuthKey.value++
    if (role === 'admin') adminAuthKey.value++
  }
  activeRole.value = role
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- ロールタブ -->
    <div class="w-full max-w-lg mx-auto px-4 pt-2 flex items-center gap-2">
      <div class="flex-1 flex gap-1 bg-gray-200 rounded-lg p-1">
        <button
          v-for="role in roleTabOptions"
          :key="role"
          class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          :class="activeRole === role
            ? 'bg-white text-gray-800 shadow-sm'
            : 'text-gray-600 hover:text-gray-800'"
          @click="onRoleTabClick(role)"
        >
          {{ roleLabels[role] }}
        </button>
      </div>
      <button
        class="p-2 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
        title="ページ更新"
        @click="location.reload()"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4.49 15a8 8 0 0013.02 2.13M19.51 9A8 8 0 006.49 6.87" />
        </svg>
      </button>
    </div>

    <!-- 運行者タブ -->
    <template v-if="activeRole === 'driver'">
      <!-- 通常点呼 / 自動点呼 サブタブ + ハンバーガーメニュー -->
      <div class="w-full max-w-lg mx-auto px-4 mt-2 flex items-center gap-2">
        <div class="flex-1 flex gap-1 bg-blue-100 rounded-lg p-1">
          <button
            v-for="tab in ([
              { key: 'normal' as const, label: '通常点呼' },
              { key: 'tenko' as const, label: '自動点呼' },
              { key: 'remote' as const, label: '遠隔点呼' },
            ])"
            :key="tab.key"
            class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            :class="driverSubTab === tab.key
              ? 'bg-white text-blue-800 shadow-sm'
              : 'text-blue-700 hover:text-blue-900'"
            @click="driverSubTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
        <!-- ハンバーガーメニュー -->
        <div ref="menuRef" class="relative">
          <button
            class="p-2 rounded-md transition-colors"
            :class="['demo', 'remote_demo', 'device'].includes(driverSubTab)
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'"
            @click.stop="menuOpen = !menuOpen"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div
            v-if="menuOpen"
            class="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border py-1 z-50"
          >
            <button
              v-for="item in ([
                { key: 'demo' as const, label: '自動点呼デモ' },
                { key: 'remote_demo' as const, label: '遠隔点呼デモ' },
                { key: 'device' as const, label: 'デバイス設定' },
              ])"
              :key="item.key"
              class="w-full text-left px-4 py-2 text-sm transition-colors"
              :class="driverSubTab === item.key
                ? 'bg-blue-50 text-blue-800 font-medium'
                : 'text-gray-700 hover:bg-gray-100'"
              @click="onMenuSelect(item.key)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
      </div>

      <NormalMeasurement v-if="driverSubTab === 'normal'" class="flex-1 min-h-0" />
      <TenkoKiosk v-if="driverSubTab === 'tenko'" class="flex-1 min-h-0" />
      <TenkoKiosk v-if="driverSubTab === 'remote'" :remote-mode="true" class="flex-1 min-h-0" />
      <TenkoKiosk v-if="driverSubTab === 'remote_demo'" :remote-mode="true" :demo-mode="true" class="flex-1 min-h-0" />
      <TenkoKiosk v-if="driverSubTab === 'demo'" :demo-mode="true" class="flex-1 min-h-0" />
      <DeviceSettings v-if="driverSubTab === 'device'" class="flex-1 min-h-0" />

      <!-- 画面共有: タブに関係なく常時フローティング表示 -->
      <ScreenShareSender />
      <!-- 測定ログ: フッターバー (常時表示) -->
      <MeasurementLog />
    </template>

    <!-- 運行管理者タブ -->
    <RoleAuthGate v-if="activeRole === 'manager'" :key="managerAuthKey" required-role="manager" class="flex-1 min-h-0">
      <ManagerDashboard />
    </RoleAuthGate>

    <!-- システム管理者タブ -->
    <RoleAuthGate v-if="activeRole === 'admin'" :key="adminAuthKey" required-role="admin" class="flex-1 min-h-0">
      <AdminDashboard />
    </RoleAuthGate>
  </div>
</template>
