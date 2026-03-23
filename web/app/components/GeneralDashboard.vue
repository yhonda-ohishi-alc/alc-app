<script setup lang="ts">
type TabKey = 'daily_health' | 'baselines' | 'employees' | 'carrying_items' | 'guidance' | 'communication'

const activeTab = ref<TabKey>('daily_health')
const { user, deviceTenantId } = useAuth()
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <!-- ユーザー情報バー -->
    <div class="px-4 pt-3 flex justify-end items-center text-sm">
      <div v-if="user" class="flex items-center gap-2 text-gray-600">
        <span class="font-medium">{{ user.name }}</span>
        <span class="text-gray-400">{{ user.email }}</span>
        <span class="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{{ user.role }}</span>
      </div>
    </div>

    <div class="px-4 pt-2 flex justify-center">
      <div class="flex flex-wrap gap-1 bg-green-100 rounded-lg p-1 w-fit">
        <button
          v-for="tab in [
            { key: 'daily_health', label: '健康状態' },
            { key: 'baselines', label: '健康基準' },
            { key: 'employees', label: '乗務員台帳' },
            { key: 'carrying_items', label: '携行品' },
            { key: 'guidance', label: '指導監督' },
            { key: 'communication', label: '伝達事項' },
          ]"
          :key="tab.key"
          class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          :class="activeTab === tab.key ? 'bg-white text-green-800 shadow-sm' : 'text-green-700 hover:text-green-900'"
          @click="activeTab = tab.key as TabKey"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div v-if="activeTab === 'daily_health'">
        <DailyHealthStatus />
      </div>

      <div v-if="activeTab === 'baselines'">
        <HealthBaselineManager />
      </div>

      <div v-if="activeTab === 'employees'">
        <EmployeeList />
      </div>

      <div v-if="activeTab === 'carrying_items'">
        <CarryingItemsManager />
      </div>

      <div v-if="activeTab === 'guidance'">
        <GuidanceRecordManager />
      </div>

      <div v-if="activeTab === 'communication'">
        <CommunicationItemManager />
      </div>
    </div>
  </div>
</template>
