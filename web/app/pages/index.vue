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

// Android 横画面検出
const { isAndroidLandscape } = useAndroidLandscape()

// --- ロールタブ ---
type RoleTab = 'driver' | 'manager' | 'admin'
const roleTabOptions: RoleTab[] = ['driver', 'manager', 'admin']
const activeRole = ref<RoleTab>(
  roleTabOptions.includes(route.query.role as RoleTab)
    ? (route.query.role as RoleTab)
    : 'driver',
)

// --- 運行者サブタブ ---
type DriverSubTab = 'normal' | 'tenko' | 'remote' | 'timecard' | 'demo' | 'remote_demo' | 'device'
const driverSubTab = ref<DriverSubTab>(
  route.query.tab === 'tenko' ? 'tenko'
  : route.query.tab === 'demo' ? 'demo'
  : route.query.tab === 'remote' ? 'remote'
  : route.query.tab === 'remote_demo' ? 'remote_demo'
  : route.query.tab === 'timecard' ? 'timecard'
  : route.query.tab === 'device' ? 'device'
  : 'normal',
)

// URL クエリ同期
watch(activeRole, (role) => {
  const params = new URLSearchParams()
  if (role !== 'driver') params.set('role', role)
  const qs = params.toString()
  window.history.replaceState({}, '', qs ? `/?${qs}` : '/')
})

watch(driverSubTab, (tab) => {
  if (activeRole.value !== 'driver') return
  const params = new URLSearchParams()
  if (tab !== 'normal') params.set('tab', tab)
  const qs = params.toString()
  window.history.replaceState({}, '', qs ? `/?${qs}` : '/')
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
    <!-- ロールタブ (Android横画面時は非表示→ハンバーガーメニューに移動) -->
    <div v-if="!isAndroidLandscape" class="w-full max-w-lg mx-auto px-4 pt-2 flex items-center gap-2">
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
      <!-- 通常点呼 / 自動点呼 サブタブ + ハンバーガーメニュー (縦画面時のみ) -->
      <div v-if="!isAndroidLandscape" class="w-full max-w-lg mx-auto px-4 mt-2 flex items-center gap-2">
        <div class="flex-1 flex gap-1 bg-blue-100 rounded-lg p-1">
          <button
            v-for="tab in ([
              { key: 'normal' as const, label: '通常点呼' },
              { key: 'tenko' as const, label: '自動点呼' },
              { key: 'remote' as const, label: '遠隔点呼' },
              { key: 'timecard' as const, label: 'タイムカード' },
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
            class="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border py-1 z-50"
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

      <!-- メインコンテンツラッパー: 横画面=flex-row(サイドバー+コンテンツ), 縦画面=contents(透過) -->
      <div :class="isAndroidLandscape ? 'flex flex-1 min-h-0' : 'contents'">
        <!-- 左サイドバー (横画面時のみ) -->
        <nav v-if="isAndroidLandscape" class="w-28 shrink-0 bg-gray-50 border-r flex flex-col py-2 px-1 gap-0.5 overflow-y-auto">
          <!-- ロールタブ -->
          <button
            v-for="role in roleTabOptions"
            :key="role"
            class="w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-left"
            :class="activeRole === role
              ? 'bg-gray-200 text-gray-800'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
            @click="onRoleTabClick(role)"
          >
            {{ roleLabels[role] }}
          </button>
          <div class="border-t my-1" />
          <!-- サブタブ -->
          <button
            v-for="tab in ([
              { key: 'normal' as const, label: '通常点呼' },
              { key: 'tenko' as const, label: '自動点呼' },
              { key: 'remote' as const, label: '遠隔点呼' },
              { key: 'timecard' as const, label: 'タイムカード' },
            ])"
            :key="tab.key"
            class="w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-left"
            :class="driverSubTab === tab.key
              ? 'bg-blue-100 text-blue-800'
              : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'"
            @click="driverSubTab = tab.key"
          >
            {{ tab.label }}
          </button>
          <div class="border-t my-1" />
          <!-- その他メニュー -->
          <button
            v-for="item in ([
              { key: 'demo' as const, label: '自動点呼デモ' },
              { key: 'remote_demo' as const, label: '遠隔点呼デモ' },
              { key: 'device' as const, label: 'デバイス設定' },
            ])"
            :key="item.key"
            class="w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-left"
            :class="driverSubTab === item.key
              ? 'bg-blue-100 text-blue-800'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'"
            @click="driverSubTab = item.key"
          >
            {{ item.label }}
          </button>
          <!-- 測定ログ (サイドバー内) -->
          <div class="border-t my-1" />
          <MeasurementLog :sidebar="true" />
          <!-- リフレッシュボタン -->
          <div class="mt-auto pt-2">
            <button
              class="w-full p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex justify-center"
              title="ページ更新"
              @click="location.reload()"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4.49 15a8 8 0 0013.02 2.13M19.51 9A8 8 0 006.49 6.87" />
              </svg>
            </button>
          </div>
        </nav>

        <!-- コンテンツ (1箇所のみ: 横画面=flex子要素, 縦画面=contents透過でルート直下) -->
        <div :class="isAndroidLandscape ? 'flex-1 min-w-0 flex flex-col' : 'contents'">
          <NormalMeasurement v-if="driverSubTab === 'normal'" :landscape="isAndroidLandscape" class="flex-1 min-h-0" />
          <TenkoKiosk v-if="driverSubTab === 'tenko'" :landscape="isAndroidLandscape" class="flex-1 min-h-0" />
          <TenkoKiosk v-if="driverSubTab === 'remote'" :remote-mode="true" :landscape="isAndroidLandscape" class="flex-1 min-h-0" />
          <TenkoKiosk v-if="driverSubTab === 'remote_demo'" :remote-mode="true" :demo-mode="true" :landscape="isAndroidLandscape" class="flex-1 min-h-0" />
          <TenkoKiosk v-if="driverSubTab === 'demo'" :demo-mode="true" :landscape="isAndroidLandscape" class="flex-1 min-h-0" />
          <TimePunchKiosk v-if="driverSubTab === 'timecard'" :landscape="isAndroidLandscape" class="flex-1 min-h-0" />
          <DeviceSettings v-if="driverSubTab === 'device'" class="flex-1 min-h-0" />
        </div>
      </div>

      <!-- 画面共有: タブに関係なく常時フローティング表示 -->
      <ScreenShareSender />
      <!-- 測定ログ: フッターバー (縦画面時のみ。横画面時はサイドバー内) -->
      <MeasurementLog v-if="!isAndroidLandscape" />
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
