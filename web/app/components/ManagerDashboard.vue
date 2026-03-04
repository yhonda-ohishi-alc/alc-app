<script setup lang="ts">
type TabKey = 'history' | 'tenko' | 'remote_tenko' | 'screen_share' | 'schedules' | 'records' | 'baselines' | 'failures'
const activeTab = ref<TabKey>('tenko')
const tenkoDashboardSummaryRef = ref<{ refresh: () => void } | null>(null)
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden">
    <div class="px-4 pt-4 flex justify-center">
      <div class="flex flex-wrap gap-1 bg-blue-100 rounded-lg p-1 w-fit">
        <button
          v-for="tab in [
            { key: 'tenko', label: '点呼' },
            { key: 'remote_tenko', label: '遠隔点呼' },
            { key: 'screen_share', label: '画面共有' },
            { key: 'history', label: '測定履歴' },
            { key: 'schedules', label: '予定管理' },
            { key: 'records', label: '点呼記録' },
            { key: 'baselines', label: '健康基準' },
            { key: 'failures', label: '故障記録' },
          ]"
          :key="tab.key"
          class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          :class="activeTab === tab.key ? 'bg-white text-blue-800 shadow-sm' : 'text-blue-700 hover:text-blue-900'"
          @click="activeTab = tab.key as TabKey"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4">
      <div v-if="activeTab === 'tenko'" class="space-y-4">
        <TenkoDashboardSummary ref="tenkoDashboardSummaryRef" />
        <h2 class="text-sm font-medium text-gray-700">進行中セッション</h2>
        <TenkoSessionMonitor @changed="tenkoDashboardSummaryRef?.refresh()" />
      </div>

      <div v-if="activeTab === 'remote_tenko'">
        <TenkoRemoteAdminView />
      </div>

      <div v-if="activeTab === 'screen_share'">
        <ScreenShareAdminView />
      </div>

      <div v-if="activeTab === 'history'">
        <MeasurementHistory />
      </div>

      <div v-if="activeTab === 'schedules'">
        <TenkoScheduleManager />
      </div>

      <div v-if="activeTab === 'records'">
        <TenkoRecordViewer />
      </div>

      <div v-if="activeTab === 'baselines'">
        <HealthBaselineManager />
      </div>

      <div v-if="activeTab === 'failures'">
        <EquipmentFailureManager />
      </div>
    </div>
  </div>
</template>
