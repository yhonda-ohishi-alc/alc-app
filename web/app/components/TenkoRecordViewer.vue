<script setup lang="ts">
import type { TenkoRecord, TenkoRecordFilter, TenkoType, ApiEmployee } from '~/types'
import { listTenkoRecords, downloadTenkoRecordsCsv, getEmployees } from '~/utils/api'

const records = ref<TenkoRecord[]>([])
const total = ref(0)
const page = ref(1)
const perPage = 20
const isLoading = ref(false)
const error = ref<string | null>(null)
const isDownloading = ref(false)

// 従業員マップ
const employees = ref<ApiEmployee[]>([])
async function loadEmployees() {
  try { employees.value = await getEmployees() } catch {}
}

// フィルタ
const filterEmployeeId = ref('')
const filterTenkoType = ref<'' | TenkoType>('')
const filterStatus = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')

function buildFilter(): TenkoRecordFilter {
  const f: TenkoRecordFilter = {}
  if (filterEmployeeId.value) f.employee_id = filterEmployeeId.value
  if (filterTenkoType.value) f.tenko_type = filterTenkoType.value
  if (filterStatus.value) f.status = filterStatus.value
  if (filterDateFrom.value) f.date_from = filterDateFrom.value
  if (filterDateTo.value) f.date_to = filterDateTo.value
  return f
}

async function fetchData() {
  isLoading.value = true
  error.value = null
  try {
    const res = await listTenkoRecords({ ...buildFilter(), page: page.value, per_page: perPage })
    records.value = res.records
    total.value = res.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : '取得エラー'
  } finally {
    isLoading.value = false
  }
}

function applyFilter() { page.value = 1; fetchData() }
function changePage(p: number) { page.value = p; fetchData() }
const totalPages = computed(() => Math.ceil(total.value / perPage))

async function handleCsvDownload() {
  isDownloading.value = true
  error.value = null
  try {
    await downloadTenkoRecordsCsv(buildFilter())
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'CSVダウンロードエラー'
  } finally {
    isDownloading.value = false
  }
}

// 詳細モーダル
const selectedRecord = ref<TenkoRecord | null>(null)

function formatDate(iso: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function tenkoTypeLabel(t: string) {
  return t === 'pre_operation' ? '業務前' : '業務後'
}

function statusLabel(s: string) {
  const map: Record<string, string> = { completed: '完了', cancelled: 'キャンセル', interrupted: '中断' }
  return map[s] || s
}

function statusColor(s: string) {
  if (s === 'completed') return 'bg-green-100 text-green-800'
  if (s === 'cancelled') return 'bg-red-100 text-red-800'
  if (s === 'interrupted') return 'bg-orange-100 text-orange-800'
  return 'bg-gray-100 text-gray-600'
}

function alcoholLabel(r: string | null) {
  if (!r) return '-'
  const map: Record<string, string> = { pass: '正常', fail: '検出', normal: '正常', over: '基準超', error: 'エラー' }
  return map[r] || r
}

function selfDeclarationLabel(key: string) {
  const map: Record<string, string> = { illness: '疾病', fatigue: '疲労', sleep_deprivation: '睡眠不足' }
  return map[key] || key
}

function inspectionLabel(key: string) {
  const map: Record<string, string> = {
    brakes: 'ブレーキ', tires: 'タイヤ', lights: 'ライト', steering: 'ステアリング',
    wipers: 'ワイパー', mirrors: 'ミラー', horn: 'ホーン', seatbelts: 'シートベルト',
  }
  return map[key] || key
}

onMounted(() => { loadEmployees(); fetchData() })
</script>

<template>
  <div>
    <!-- フィルタ -->
    <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <select v-model="filterEmployeeId" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">全乗務員</option>
          <option v-for="emp in employees" :key="emp.id" :value="emp.id">{{ emp.name }}</option>
        </select>
        <select v-model="filterTenkoType" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">全種別</option>
          <option value="pre_operation">業務前</option>
          <option value="post_operation">業務後</option>
        </select>
        <select v-model="filterStatus" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">全ステータス</option>
          <option value="completed">完了</option>
          <option value="cancelled">キャンセル</option>
          <option value="interrupted">中断</option>
        </select>
        <input v-model="filterDateFrom" type="date" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <input v-model="filterDateTo" type="date" class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="flex gap-2 mt-3">
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors" @click="applyFilter">検索</button>
        <button
          :disabled="isDownloading"
          class="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
          @click="handleCsvDownload"
        >{{ isDownloading ? 'ダウンロード中...' : 'CSV出力' }}</button>
      </div>
    </div>

    <!-- エラー -->
    <div v-if="error" class="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">{{ error }}</div>

    <!-- ローディング -->
    <div v-if="isLoading" class="text-center py-8 text-gray-500">読み込み中...</div>

    <!-- テーブル -->
    <div v-else-if="records.length > 0" class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="px-4 py-3 text-left font-medium">記録日時</th>
              <th class="px-4 py-3 text-left font-medium">乗務員</th>
              <th class="px-4 py-3 text-center font-medium">種別</th>
              <th class="px-4 py-3 text-center font-medium">ステータス</th>
              <th class="px-4 py-3 text-center font-medium">アルコール</th>
              <th class="px-4 py-3 text-right font-medium">体温</th>
              <th class="px-4 py-3 text-right font-medium">血圧</th>
              <th class="px-4 py-3 text-left font-medium">管理者</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="r in records" :key="r.id" class="hover:bg-gray-50 cursor-pointer" @click="selectedRecord = r">
              <td class="px-4 py-3 text-gray-700">{{ formatDate(r.recorded_at) }}</td>
              <td class="px-4 py-3 text-gray-700">{{ r.employee_name }}</td>
              <td class="px-4 py-3 text-center">
                <span class="inline-block px-2 py-1 rounded-full text-xs font-medium"
                  :class="r.tenko_type === 'pre_operation' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'">
                  {{ tenkoTypeLabel(r.tenko_type) }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="inline-block px-2 py-1 rounded-full text-xs font-medium" :class="statusColor(r.status)">
                  {{ statusLabel(r.status) }}
                </span>
              </td>
              <td class="px-4 py-3 text-center">
                <span v-if="r.alcohol_result"
                  class="inline-block px-2 py-1 rounded-full text-xs font-medium"
                  :class="r.alcohol_result === 'pass' || r.alcohol_result === 'normal' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                  {{ alcoholLabel(r.alcohol_result) }}
                </span>
                <span v-else class="text-gray-400 text-xs">-</span>
              </td>
              <td class="px-4 py-3 text-right text-gray-700">{{ r.temperature != null ? r.temperature.toFixed(1) + ' &#8451;' : '-' }}</td>
              <td class="px-4 py-3 text-right text-gray-700">{{ r.systolic != null ? `${r.systolic}/${r.diastolic}` : '-' }}</td>
              <td class="px-4 py-3 text-gray-700">{{ r.responsible_manager_name }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ページネーション -->
      <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-gray-100">
        <p class="text-sm text-gray-500">全 {{ total }} 件中 {{ (page - 1) * perPage + 1 }}-{{ Math.min(page * perPage, total) }} 件</p>
        <div class="flex gap-1">
          <button :disabled="page <= 1" class="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50" @click="changePage(page - 1)">前</button>
          <button :disabled="page >= totalPages" class="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-50 hover:bg-gray-50" @click="changePage(page + 1)">次</button>
        </div>
      </div>
    </div>

    <!-- 空状態 -->
    <div v-else class="text-center py-8 text-gray-500">点呼記録がありません</div>

    <!-- 詳細モーダル -->
    <div
      v-if="selectedRecord"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="selectedRecord = null"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">点呼記録詳細</h3>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="selectedRecord = null">&times;</button>
        </div>

        <div class="space-y-4 text-sm">
          <!-- 基本情報 -->
          <div class="grid grid-cols-2 gap-2">
            <div><span class="text-gray-500">乗務員:</span> {{ selectedRecord.employee_name }}</div>
            <div><span class="text-gray-500">種別:</span> {{ tenkoTypeLabel(selectedRecord.tenko_type) }}</div>
            <div><span class="text-gray-500">ステータス:</span>
              <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium" :class="statusColor(selectedRecord.status)">{{ statusLabel(selectedRecord.status) }}</span>
            </div>
            <div><span class="text-gray-500">管理者:</span> {{ selectedRecord.responsible_manager_name }}</div>
            <div><span class="text-gray-500">方式:</span> {{ selectedRecord.tenko_method }}</div>
            <div><span class="text-gray-500">場所:</span> {{ selectedRecord.location || '-' }}</div>
            <div><span class="text-gray-500">開始:</span> {{ formatDate(selectedRecord.started_at) }}</div>
            <div><span class="text-gray-500">完了:</span> {{ formatDate(selectedRecord.completed_at) }}</div>
            <div><span class="text-gray-500">記録日時:</span> {{ formatDate(selectedRecord.recorded_at) }}</div>
            <div><span class="text-gray-500">ハッシュ:</span> <span class="font-mono text-xs">{{ selectedRecord.record_hash.slice(0, 16) }}...</span></div>
          </div>

          <!-- アルコール -->
          <div v-if="selectedRecord.alcohol_result" class="bg-gray-50 rounded-lg p-3">
            <h4 class="font-medium text-gray-700 mb-1">アルコール検査</h4>
            <div class="grid grid-cols-2 gap-2">
              <div><span class="text-gray-500">結果:</span> {{ alcoholLabel(selectedRecord.alcohol_result) }}</div>
              <div><span class="text-gray-500">値:</span> {{ selectedRecord.alcohol_value != null ? selectedRecord.alcohol_value.toFixed(3) + ' mg/L' : '-' }}</div>
              <div><span class="text-gray-500">顔写真:</span> {{ selectedRecord.alcohol_has_face_photo ? 'あり' : 'なし' }}</div>
            </div>
          </div>

          <!-- 医療データ -->
          <div v-if="selectedRecord.temperature != null || selectedRecord.systolic != null" class="bg-gray-50 rounded-lg p-3">
            <h4 class="font-medium text-gray-700 mb-1">医療データ</h4>
            <div class="grid grid-cols-2 gap-2">
              <div v-if="selectedRecord.temperature != null"><span class="text-gray-500">体温:</span> {{ selectedRecord.temperature.toFixed(1) }} &#8451;</div>
              <div v-if="selectedRecord.systolic != null"><span class="text-gray-500">血圧:</span> {{ selectedRecord.systolic }}/{{ selectedRecord.diastolic }} mmHg</div>
              <div v-if="selectedRecord.pulse != null"><span class="text-gray-500">脈拍:</span> {{ selectedRecord.pulse }} bpm</div>
            </div>
          </div>

          <!-- 指示事項 -->
          <div v-if="selectedRecord.instruction" class="bg-gray-50 rounded-lg p-3">
            <h4 class="font-medium text-gray-700 mb-1">指示事項</h4>
            <p>{{ selectedRecord.instruction }}</p>
            <p class="text-gray-500 mt-1">確認日時: {{ formatDate(selectedRecord.instruction_confirmed_at) }}</p>
          </div>

          <!-- 自己申告 -->
          <div v-if="selectedRecord.self_declaration" class="bg-gray-50 rounded-lg p-3">
            <h4 class="font-medium text-gray-700 mb-1">自己申告</h4>
            <div class="flex gap-3">
              <span v-for="(val, key) in { illness: selectedRecord.self_declaration.illness, fatigue: selectedRecord.self_declaration.fatigue, sleep_deprivation: selectedRecord.self_declaration.sleep_deprivation }" :key="key"
                class="inline-block px-2 py-1 rounded-full text-xs font-medium"
                :class="val ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'">
                {{ selfDeclarationLabel(key as string) }}: {{ val ? 'あり' : 'なし' }}
              </span>
            </div>
          </div>

          <!-- 安全判定 -->
          <div v-if="selectedRecord.safety_judgment" class="bg-gray-50 rounded-lg p-3">
            <h4 class="font-medium text-gray-700 mb-1">安全判定</h4>
            <span class="inline-block px-2 py-1 rounded-full text-xs font-medium"
              :class="selectedRecord.safety_judgment.status === 'pass' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
              {{ selectedRecord.safety_judgment.status === 'pass' ? '合格' : '不合格' }}
            </span>
            <span v-if="selectedRecord.safety_judgment.failed_items.length > 0" class="ml-2 text-red-700">
              不合格項目: {{ selectedRecord.safety_judgment.failed_items.map(selfDeclarationLabel).join(', ') }}
            </span>
          </div>

          <!-- 日常点検 -->
          <div v-if="selectedRecord.daily_inspection" class="bg-gray-50 rounded-lg p-3">
            <h4 class="font-medium text-gray-700 mb-1">日常点検</h4>
            <div class="flex flex-wrap gap-2">
              <span v-for="key in ['brakes', 'tires', 'lights', 'steering', 'wipers', 'mirrors', 'horn', 'seatbelts']" :key="key"
                class="inline-block px-2 py-1 rounded-full text-xs font-medium"
                :class="(selectedRecord.daily_inspection as any)[key] === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                {{ inspectionLabel(key) }}: {{ (selectedRecord.daily_inspection as any)[key] === 'ok' ? 'OK' : 'NG' }}
              </span>
            </div>
          </div>

          <!-- 運行報告 -->
          <div v-if="selectedRecord.report_no_report !== null" class="bg-gray-50 rounded-lg p-3">
            <h4 class="font-medium text-gray-700 mb-1">運行報告</h4>
            <div v-if="selectedRecord.report_no_report" class="text-gray-500">特記事項なし</div>
            <div v-else class="space-y-1">
              <div v-if="selectedRecord.report_vehicle_road_status"><span class="text-gray-500">車両/道路:</span> {{ selectedRecord.report_vehicle_road_status }}</div>
              <div v-if="selectedRecord.report_driver_alternation"><span class="text-gray-500">交替運転:</span> {{ selectedRecord.report_driver_alternation }}</div>
            </div>
          </div>

          <!-- 中断/再開情報 -->
          <div v-if="selectedRecord.interrupted_at" class="bg-orange-50 rounded-lg p-3">
            <h4 class="font-medium text-orange-700 mb-1">中断情報</h4>
            <div><span class="text-gray-500">中断日時:</span> {{ formatDate(selectedRecord.interrupted_at) }}</div>
            <div v-if="selectedRecord.resumed_at"><span class="text-gray-500">再開日時:</span> {{ formatDate(selectedRecord.resumed_at) }}</div>
            <div v-if="selectedRecord.resume_reason"><span class="text-gray-500">再開理由:</span> {{ selectedRecord.resume_reason }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
