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
type DriverSubTab = 'normal' | 'tenko' | 'demo' | 'remote'
const driverSubTab = ref<DriverSubTab>(
  route.query.tab === 'tenko' ? 'tenko'
  : route.query.tab === 'demo' ? 'demo'
  : route.query.tab === 'remote' ? 'remote'
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
  navigateTo({ path: '/', query }, { replace: true })
})

const roleLabels: Record<RoleTab, string> = {
  driver: '運行者',
  manager: '運行管理者',
  admin: 'システム管理者',
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- ロールタブ -->
    <div class="w-full max-w-lg mx-auto px-4 pt-3">
      <div class="flex gap-1 bg-gray-200 rounded-lg p-1">
        <button
          v-for="role in roleTabOptions"
          :key="role"
          class="flex-1 px-3 py-2.5 rounded-md text-sm font-medium transition-colors"
          :class="activeRole === role
            ? 'bg-white text-gray-800 shadow-sm'
            : 'text-gray-600 hover:text-gray-800'"
          @click="activeRole = role"
        >
          {{ roleLabels[role] }}
        </button>
      </div>
    </div>

    <!-- 運行者タブ -->
    <template v-if="activeRole === 'driver'">
      <!-- 通常点呼 / 自動点呼 サブタブ -->
      <div class="w-full max-w-lg mx-auto px-4 mt-2">
        <div class="flex gap-1 bg-blue-100 rounded-lg p-1">
          <button
            v-for="tab in ([
              { key: 'normal' as const, label: '通常点呼' },
              { key: 'tenko' as const, label: '自動点呼' },
              { key: 'remote' as const, label: '遠隔点呼' },
              { key: 'demo' as const, label: 'デモ' },
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
      </div>

      <NormalMeasurement v-if="driverSubTab === 'normal'" class="flex-1 min-h-0" />
      <TenkoKiosk v-if="driverSubTab === 'tenko'" class="flex-1 min-h-0" />
      <TenkoKiosk v-if="driverSubTab === 'remote'" :remote-mode="true" class="flex-1 min-h-0" />
      <TenkoKiosk v-if="driverSubTab === 'demo'" :demo-mode="true" class="flex-1 min-h-0" />
    </template>

    <!-- 運行管理者タブ -->
    <RoleAuthGate v-if="activeRole === 'manager'" required-role="manager" class="flex-1 min-h-0">
      <ManagerDashboard />
    </RoleAuthGate>

    <!-- システム管理者タブ -->
    <RoleAuthGate v-if="activeRole === 'admin'" required-role="admin" class="flex-1 min-h-0">
      <AdminDashboard />
    </RoleAuthGate>
  </div>
</template>
