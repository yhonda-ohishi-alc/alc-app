<script setup lang="ts">
import QRCode from 'qrcode'
import type { Device, DeviceRegistrationRequest, CallSchedule } from '~/types'
import {
  listDevices, listPendingDeviceRegistrations,
  createDeviceUrlToken, createPermanentQr,
  approveDevice, rejectDevice, disableDevice, enableDevice, deleteDevice,
  updateDeviceCallSettings, testFcmNotification, testFcmAll,
} from '~/utils/api'
import type { TestFcmAllResult } from '~/utils/api'

const devices = ref<Device[]>([])
const pending = ref<DeviceRegistrationRequest[]>([])
const loading = ref(false)
const error = ref('')

// 承認待ち = qr_permanent のみ (url は即承認なので除外)
const pendingForApproval = computed(() =>
  pending.value.filter(r => r.flow_type === 'qr_permanent')
)
// QR一時/URL生成済み未使用トークン
const pendingUrlTokens = computed(() =>
  pending.value.filter(r => r.flow_type === 'url')
)

// URL トークン生成
const urlTokenName = ref('')
const generatedUrl = ref('')
const urlCopied = ref(false)

// QR一時生成
const qrTempName = ref('')
const qrTempCode = ref('')
const qrTempDataUrl = ref('')
const qrTempDeviceName = ref('')

// QR永久生成
const permanentQrName = ref('')
const permanentQrCode = ref('')
const permanentQrDataUrl = ref('')

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const [d, p] = await Promise.all([listDevices(), listPendingDeviceRegistrations()])
    devices.value = d
    pending.value = p
    fetchWatchers()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'データの取得に失敗しました'
  } finally {
    loading.value = false
  }
}

async function handleCreateUrlToken() {
  try {
    const res = await createDeviceUrlToken(urlTokenName.value || undefined)
    generatedUrl.value = `${window.location.origin}${res.registration_url}`
    urlTokenName.value = ''
    urlCopied.value = false
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'トークン生成に失敗しました'
  }
}

async function copyUrl() {
  await navigator.clipboard.writeText(generatedUrl.value)
  urlCopied.value = true
  setTimeout(() => { urlCopied.value = false }, 2000)
}

async function handleCreateQrTemp() {
  try {
    const res = await createDeviceUrlToken(qrTempName.value || undefined)
    qrTempCode.value = res.registration_code
    qrTempDeviceName.value = qrTempName.value || ''
    const claimUrl = `${window.location.origin}${res.registration_url}`
    qrTempDataUrl.value = await QRCode.toDataURL(claimUrl, { width: 200, margin: 2 })
    qrTempName.value = ''
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'QR生成に失敗しました'
  }
}

async function handleCreatePermanentQr() {
  try {
    const res = await createPermanentQr(permanentQrName.value || undefined)
    permanentQrCode.value = res.registration_code
    const claimUrl = `${window.location.origin}/device-claim?token=${res.registration_code}`
    permanentQrDataUrl.value = await QRCode.toDataURL(claimUrl, { width: 200, margin: 2 })
    permanentQrName.value = ''
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'QR生成に失敗しました'
  }
}

async function downloadQrPdf() {
  if (!permanentQrCode.value || !permanentQrDataUrl.value) return
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(16)
  doc.text('ALC Device Registration', 105, 30, { align: 'center' })

  doc.addImage(permanentQrDataUrl.value, 'PNG', 55, 50, 100, 100)

  doc.setFontSize(10)
  doc.text(`Code: ${permanentQrCode.value}`, 105, 165, { align: 'center' })

  doc.setFontSize(9)
  doc.text('1. Scan QR or open URL on device', 105, 180, { align: 'center' })
  doc.text('2. Enter device name', 105, 188, { align: 'center' })
  doc.text('3. Wait for admin approval', 105, 196, { align: 'center' })

  doc.save(`device-qr-${permanentQrCode.value.slice(0, 8)}.pdf`)
}

async function handleApprove(id: string) {
  try {
    await approveDevice(id)
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '承認に失敗しました'
  }
}

async function handleReject(id: string) {
  try {
    await rejectDevice(id)
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '拒否に失敗しました'
  }
}

async function handleDisable(id: string) {
  try {
    await disableDevice(id)
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '無効化に失敗しました'
  }
}

async function handleEnable(id: string) {
  try {
    await enableDevice(id)
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '有効化に失敗しました'
  }
}

async function handleDelete(id: string) {
  if (!confirm('このデバイスを削除しますか?')) return
  try {
    await deleteDevice(id)
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '削除に失敗しました'
  }
}

// 生成済みトークンのQR再表示用
const tokenQrUrls = ref<Record<string, string>>({})

async function toggleQr(code: string) {
  if (tokenQrUrls.value[code]) {
    delete tokenQrUrls.value[code]
    tokenQrUrls.value = { ...tokenQrUrls.value }
    return
  }
  const claimUrl = `${window.location.origin}/device-claim?token=${code}`
  tokenQrUrls.value[code] = await QRCode.toDataURL(claimUrl, { width: 200, margin: 2 })
}

// 着信設定
const expandedCallSettings = ref<Set<string>>(new Set())
const editingSchedules = ref<Record<string, CallSchedule>>({})
const signalingUrl = useRuntimeConfig().public.signalingUrl as string || ''
const connectedDeviceIds = ref<Set<string>>(new Set())

async function fetchWatchers() {
  if (!signalingUrl) return
  try {
    const url = signalingUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/watchers`)
    if (res.ok) {
      const data = await res.json() as { count: number; watchers: { deviceId: string }[] }
      connectedDeviceIds.value = new Set(data.watchers.map(w => w.deviceId).filter(id => id !== '(no tag)'))
    }
  } catch { /* ignore */ }
}

const defaultSchedule: CallSchedule = {
  enabled: false,
  startHour: 8,
  startMin: 0,
  endHour: 17,
  endMin: 0,
  days: [1, 2, 3, 4, 5],
}

function toggleCallSettings(dev: Device) {
  const id = dev.id
  if (expandedCallSettings.value.has(id)) {
    expandedCallSettings.value.delete(id)
    expandedCallSettings.value = new Set(expandedCallSettings.value)
  } else {
    editingSchedules.value[id] = dev.call_schedule
      ? { ...dev.call_schedule }
      : { ...defaultSchedule }
    expandedCallSettings.value.add(id)
    expandedCallSettings.value = new Set(expandedCallSettings.value)
  }
}

function updateScheduleForDevice(deviceId: string, schedule: CallSchedule) {
  editingSchedules.value[deviceId] = schedule
}

async function toggleCallEnabled(dev: Device) {
  const newEnabled = !dev.call_enabled
  try {
    await updateDeviceCallSettings(dev.id, newEnabled, dev.call_schedule)
    // DOにも通知
    await syncScheduleToDO(dev.id, newEnabled
      ? { ...(dev.call_schedule || { startHour: 0, startMin: 0, endHour: 23, endMin: 59, days: [0, 1, 2, 3, 4, 5, 6] }), enabled: true }
      : { ...defaultSchedule, enabled: false })
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '着信設定の更新に失敗しました'
  }
}

async function saveCallSchedule(dev: Device) {
  const schedule = editingSchedules.value[dev.id]
  if (!schedule) return
  try {
    await updateDeviceCallSettings(dev.id, dev.call_enabled, schedule)
    // DOにも通知 (enabled は dev.call_enabled を使う)
    await syncScheduleToDO(dev.id, { ...schedule, enabled: dev.call_enabled })
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'スケジュール保存に失敗しました'
  }
}

// 着信テスト
const testingDevice = ref<string | null>(null)
const testResult = ref<{ deviceId: string; success: boolean; message: string } | null>(null)

// 一斉テスト
const testingAll = ref(false)
const testAllResults = ref<{ device_id: string; sent: boolean; blocked: boolean; reason: string }[]>([])

async function testCallAll() {
  if (!signalingUrl) {
    error.value = 'シグナリングURLが設定されていません'
    return
  }
  testingAll.value = true
  testAllResults.value = []
  try {
    const url = signalingUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/test-call-all`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json() as { ok: boolean; results: typeof testAllResults.value }
      testAllResults.value = data.results
      setTimeout(() => { testAllResults.value = [] }, 5000)
    } else {
      error.value = '一斉テストの送信に失敗しました'
    }
  } catch {
    error.value = '一斉テストの送信に失敗しました'
  } finally {
    testingAll.value = false
  }
}

// 一斉テスト (WebSocket + FCM fallback)
const testingAllWithFcm = ref(false)
const testAllWithFcmResults = ref<{ device_id: string; sent: boolean; blocked: boolean; via: string; reason: string }[]>([])

async function testCallAllWithFcm() {
  if (!signalingUrl) {
    error.value = 'シグナリングURLが設定されていません'
    return
  }
  testingAllWithFcm.value = true
  testAllWithFcmResults.value = []
  try {
    const url = signalingUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/test-call-all-with-fcm`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json() as { ok: boolean; results: typeof testAllWithFcmResults.value }
      testAllWithFcmResults.value = data.results
      setTimeout(() => { testAllWithFcmResults.value = [] }, 8000)
    } else {
      error.value = '一斉テスト(FCM)の送信に失敗しました'
    }
  } catch {
    error.value = '一斉テスト(FCM)の送信に失敗しました'
  } finally {
    testingAllWithFcm.value = false
  }
}

async function testCall(deviceId: string) {
  if (!signalingUrl) {
    error.value = 'シグナリングURLが設定されていません'
    return
  }
  testingDevice.value = deviceId
  testResult.value = null
  try {
    const url = signalingUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/test-call/${deviceId}`, { method: 'POST' })
    if (res.status === 404) {
      testResult.value = { deviceId, success: false, message: 'デバイスが接続されていません' }
    } else if (res.ok) {
      const data = await res.json() as { ok: boolean; sent: number; blocked: boolean; reason: string }
      if (!data.blocked) {
        testResult.value = { deviceId, success: true, message: 'テスト着信を送信しました' }
      } else {
        testResult.value = { deviceId, success: false, message: `ブロックされました: ${data.reason}` }
      }
    } else {
      testResult.value = { deviceId, success: false, message: 'テスト着信の送信に失敗しました' }
    }
  } catch {
    testResult.value = { deviceId, success: false, message: 'テスト着信の送信に失敗しました' }
  } finally {
    testingDevice.value = null
    setTimeout(() => { testResult.value = null }, 3000)
  }
}

// FCM テスト
const fcmTestingDevice = ref<string | null>(null)
const fcmTestResult = ref<{ deviceId: string; success: boolean; message: string } | null>(null)

async function testFcm(deviceId: string) {
  fcmTestingDevice.value = deviceId
  fcmTestResult.value = null
  try {
    const res = await testFcmNotification(deviceId)
    if (res.success) {
      fcmTestResult.value = { deviceId, success: true, message: 'FCM テスト送信しました' }
    } else {
      fcmTestResult.value = { deviceId, success: false, message: res.error || 'FCM 送信に失敗しました' }
    }
  } catch {
    fcmTestResult.value = { deviceId, success: false, message: 'FCM 送信に失敗しました' }
  } finally {
    fcmTestingDevice.value = null
    setTimeout(() => { fcmTestResult.value = null }, 3000)
  }
}

// FCM 一括テスト
const fcmTestingAll = ref(false)
const fcmTestAllResults = ref<TestFcmAllResult[]>([])

async function testFcmCallAll() {
  fcmTestingAll.value = true
  fcmTestAllResults.value = []
  try {
    const res = await testFcmAll()
    fcmTestAllResults.value = res.results
    setTimeout(() => { fcmTestAllResults.value = [] }, 5000)
  } catch {
    error.value = 'FCM一括テストの送信に失敗しました'
  } finally {
    fcmTestingAll.value = false
  }
}

async function syncScheduleToDO(deviceId: string, schedule: CallSchedule) {
  if (!signalingUrl) return
  try {
    const url = signalingUrl.replace(/\/$/, '')
    await fetch(`${url}/device-schedule/${deviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule),
    })
  } catch {
    // DO通知失敗は致命的でない (次回接続時にRoomWatcherが同期)
  }
}

onMounted(() => refresh())
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>

    <!-- URL トークン生成 -->
    <div class="bg-white rounded-xl shadow-sm p-4">
      <h3 class="text-sm font-medium text-gray-800 mb-2">URL で端末登録 (即承認)</h3>
      <p class="text-xs text-gray-500 mb-3">URLを生成して端末に共有 (LINE等)。端末がURLを開いてデバイス名を入力すると即登録されます。有効期限24時間。</p>
      <div class="flex gap-2">
        <input
          v-model="urlTokenName"
          type="text"
          placeholder="デバイス名 (任意)"
          class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap"
          @click="handleCreateUrlToken"
        >
          URL生成
        </button>
      </div>
      <div v-if="generatedUrl" class="mt-3 bg-gray-50 rounded-lg p-3">
        <p class="text-xs text-gray-500 mb-1">端末にこのURLを共有してください:</p>
        <div class="flex gap-2 items-center">
          <code class="flex-1 text-xs text-gray-700 break-all">{{ generatedUrl }}</code>
          <button
            class="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white whitespace-nowrap"
            @click="copyUrl"
          >
            {{ urlCopied ? 'OK' : 'Copy' }}
          </button>
        </div>
      </div>
    </div>

    <!-- QR一時 (管理者がQR生成→端末スキャン) -->
    <div class="bg-white rounded-xl shadow-sm p-4">
      <h3 class="text-sm font-medium text-gray-800 mb-2">QRコードで端末登録 (即承認)</h3>
      <p class="text-xs text-gray-500 mb-3">QRコードを生成して端末にスキャンさせると即登録。有効期限24時間。</p>
      <div class="flex gap-2">
        <input
          v-model="qrTempName"
          type="text"
          placeholder="デバイス名 (任意)"
          class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button
          class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 whitespace-nowrap"
          @click="handleCreateQrTemp"
        >
          QR生成
        </button>
      </div>
      <div v-if="qrTempDataUrl" class="mt-3 text-center space-y-2">
        <p v-if="qrTempDeviceName" class="text-sm font-medium text-gray-800">{{ qrTempDeviceName }}</p>
        <img :src="qrTempDataUrl" alt="QR Temp" class="mx-auto" />
        <p class="text-xs text-gray-500">Code: {{ qrTempCode.slice(0, 8) }}...</p>
      </div>

      <!-- 生成済みQR (未登録) -->
      <div v-if="pendingUrlTokens.length > 0" class="mt-4 border-t pt-3">
        <h4 class="text-xs font-medium text-gray-600 mb-2">生成済み・未登録 ({{ pendingUrlTokens.length }})</h4>
        <div class="space-y-2">
          <div v-for="req in pendingUrlTokens" :key="req.id" class="bg-gray-50 rounded-lg p-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-800">{{ req.device_name || '(名前なし)' }}</p>
                <p class="text-xs text-gray-400">{{ req.created_at?.slice(0, 16) }}</p>
              </div>
              <div class="flex gap-2">
                <button
                  class="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white"
                  @click="toggleQr(req.registration_code)"
                >
                  {{ tokenQrUrls[req.registration_code] ? 'QR非表示' : 'QR表示' }}
                </button>
                <button
                  class="px-3 py-1 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50"
                  @click="handleReject(req.id)"
                >
                  取消
                </button>
              </div>
            </div>
            <div v-if="tokenQrUrls[req.registration_code]" class="mt-2 text-center">
              <img :src="tokenQrUrls[req.registration_code]" alt="QR" class="mx-auto" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- QR永久生成 -->
    <div class="bg-white rounded-xl shadow-sm p-4">
      <h3 class="text-sm font-medium text-gray-800 mb-2">QR永久コード (承認あり)</h3>
      <p class="text-xs text-gray-500 mb-3">印刷用QRを生成。端末がQRを読み取って申請後、管理者が下の「承認待ち」から承認すると登録完了。有効期限なし。</p>
      <div class="flex gap-2">
        <input
          v-model="permanentQrName"
          type="text"
          placeholder="デバイス名 (任意)"
          class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button
          class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 whitespace-nowrap"
          @click="handleCreatePermanentQr"
        >
          QR生成
        </button>
      </div>
      <div v-if="permanentQrDataUrl" class="mt-3 text-center space-y-2">
        <img :src="permanentQrDataUrl" alt="Permanent QR" class="mx-auto" />
        <p class="text-xs text-gray-500">Code: {{ permanentQrCode.slice(0, 8) }}...</p>
        <button
          class="px-4 py-2 bg-gray-700 text-white rounded-lg text-xs hover:bg-gray-800"
          @click="downloadQrPdf"
        >
          PDF保存
        </button>
      </div>
    </div>

    <!-- 承認待ちリクエスト (QR永久のみ) -->
    <div v-if="pendingForApproval.length > 0" class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="px-4 py-3 bg-yellow-50 border-b">
        <h3 class="text-sm font-medium text-yellow-800">承認待ち ({{ pendingForApproval.length }})</h3>
      </div>
      <div class="divide-y divide-gray-100">
        <div v-for="req in pendingForApproval" :key="req.id" class="px-4 py-3 flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-800">{{ req.device_name || '(名前なし)' }}</p>
            <p class="text-xs text-gray-500">
              QR永久
              <span v-if="req.phone_number"> / {{ req.phone_number }}</span>
            </p>
          </div>
          <div class="flex gap-2">
            <button
              class="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
              @click="handleApprove(req.id)"
            >
              承認
            </button>
            <button
              class="px-3 py-1 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50"
              @click="handleReject(req.id)"
            >
              拒否
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- デバイス一覧 -->
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
        <h3 class="text-sm font-medium text-gray-800">登録済みデバイス ({{ devices.length }})</h3>
        <div class="flex gap-2 items-center">
          <button
            class="px-3 py-1 text-xs rounded"
            :class="testingAll
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-orange-500 text-white hover:bg-orange-600'"
            :disabled="testingAll"
            @click="testCallAll"
          >
            {{ testingAll ? '送信中...' : '一斉テスト' }}
          </button>
          <button
            class="px-3 py-1 text-xs rounded"
            :class="testingAllWithFcm
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-teal-500 text-white hover:bg-teal-600'"
            :disabled="testingAllWithFcm"
            @click="testCallAllWithFcm"
          >
            {{ testingAllWithFcm ? '送信中...' : '一斉テスト(FCM fallback)' }}
          </button>
          <button
            class="px-3 py-1 text-xs rounded"
            :class="fcmTestingAll
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-purple-500 text-white hover:bg-purple-600'"
            :disabled="fcmTestingAll"
            @click="testFcmCallAll"
          >
            {{ fcmTestingAll ? '送信中...' : 'FCM一括テスト' }}
          </button>
          <button class="text-xs text-blue-600 hover:underline" @click="refresh">更新</button>
        </div>
      </div>
      <!-- 一斉テスト結果 -->
      <div v-if="testAllResults.length > 0" class="px-4 py-2 bg-gray-50 border-b">
        <p class="text-xs font-medium text-gray-600 mb-1">一斉テスト結果</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="r in testAllResults" :key="r.device_id"
            class="inline-flex items-center px-2 py-0.5 rounded text-xs"
            :class="r.sent ? 'bg-green-100 text-green-700' : r.blocked ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'"
          >
            {{ devices.find(d => d.id === r.device_id)?.device_name || r.device_id.slice(0, 8) }}:
            {{ r.sent ? '送信済' : r.reason || '失敗' }}
          </span>
        </div>
      </div>
      <!-- 一斉テスト(FCM fallback)結果 -->
      <div v-if="testAllWithFcmResults.length > 0" class="px-4 py-2 bg-teal-50 border-b">
        <p class="text-xs font-medium text-teal-600 mb-1">一斉テスト(FCM fallback)結果</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="r in testAllWithFcmResults" :key="r.device_id"
            class="inline-flex items-center px-2 py-0.5 rounded text-xs"
            :class="r.sent ? (r.via === 'FCM' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700') : r.blocked ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'"
          >
            {{ devices.find(d => d.id === r.device_id)?.device_name || r.device_id.slice(0, 8) }}:
            {{ r.sent ? `${r.via}で送信済` : r.reason || '失敗' }}
          </span>
        </div>
      </div>
      <!-- FCM一括テスト結果 -->
      <div v-if="fcmTestAllResults.length > 0" class="px-4 py-2 bg-purple-50 border-b">
        <p class="text-xs font-medium text-purple-600 mb-1">FCM一括テスト結果</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="r in fcmTestAllResults" :key="r.device_id"
            class="inline-flex items-center px-2 py-0.5 rounded text-xs"
            :class="r.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
          >
            {{ r.device_name || r.device_id.slice(0, 8) }}:
            {{ r.success ? '送信済' : r.error || '失敗' }}
          </span>
        </div>
      </div>
      <div v-if="loading" class="p-4 text-center text-sm text-gray-500">読み込み中...</div>
      <div v-else-if="devices.length === 0" class="p-4 text-center text-sm text-gray-400">デバイスなし</div>
      <div v-else class="divide-y divide-gray-100">
        <div v-for="dev in devices" :key="dev.id" class="px-4 py-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full" :class="dev.status === 'active' ? 'bg-green-500' : 'bg-gray-300'" />
              <div>
                <p class="text-sm text-gray-800">{{ dev.device_name || dev.id.slice(0, 8) }}</p>
                <p class="text-xs text-gray-500">
                  {{ dev.device_type }}
                  <span v-if="dev.phone_number"> / {{ dev.phone_number }}</span>
                  <span class="ml-1 text-gray-400">{{ dev.created_at?.slice(0, 10) }}</span>
                  <span
                    class="ml-1 px-1 rounded text-[10px] font-medium"
                    :class="connectedDeviceIds.has(dev.id) ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'"
                  >{{ connectedDeviceIds.has(dev.id) ? 'WS接続中' : 'WS未接続' }}</span>
                  <span
                    class="ml-1 px-1 rounded text-[10px] font-medium"
                    :class="dev.fcm_token ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'"
                  >{{ dev.fcm_token ? 'FCM' : 'FCM未' }}</span>
                </p>
              </div>
            </div>
            <div class="flex gap-1">
              <!-- 着信ON/OFF -->
              <button
                class="px-2 py-1 text-xs rounded"
                :class="dev.call_enabled
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
                @click="toggleCallEnabled(dev)"
              >
                着信{{ dev.call_enabled ? 'ON' : 'OFF' }}
              </button>
              <!-- 着信テスト -->
              <button
                class="px-2 py-1 text-xs rounded"
                :class="testingDevice === dev.id
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'"
                :disabled="testingDevice === dev.id"
                @click="testCall(dev.id)"
              >
                {{ testingDevice === dev.id ? '送信中...' : 'テスト' }}
              </button>
              <!-- FCMテスト -->
              <button
                v-if="dev.fcm_token"
                class="px-2 py-1 text-xs rounded"
                :class="fcmTestingDevice === dev.id
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'"
                :disabled="fcmTestingDevice === dev.id"
                @click="testFcm(dev.id)"
              >
                {{ fcmTestingDevice === dev.id ? '送信中...' : 'FCM' }}
              </button>
              <!-- スケジュール展開 -->
              <button
                class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                @click="toggleCallSettings(dev)"
              >
                {{ expandedCallSettings.has(dev.id) ? '閉じる' : '時間帯' }}
              </button>
              <button
                v-if="dev.status === 'active'"
                class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                @click="handleDisable(dev.id)"
              >
                無効化
              </button>
              <button
                v-else
                class="px-2 py-1 text-xs border border-green-300 text-green-600 rounded hover:bg-green-50"
                @click="handleEnable(dev.id)"
              >
                有効化
              </button>
              <button
                class="px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50"
                @click="handleDelete(dev.id)"
              >
                削除
              </button>
            </div>
          </div>
          <!-- 着信テスト結果 -->
          <p
            v-if="testResult && testResult.deviceId === dev.id"
            class="mt-1 text-xs"
            :class="testResult.success ? 'text-green-600' : 'text-red-600'"
          >
            {{ testResult.message }}
          </p>
          <!-- FCMテスト結果 -->
          <p
            v-if="fcmTestResult && fcmTestResult.deviceId === dev.id"
            class="mt-1 text-xs"
            :class="fcmTestResult.success ? 'text-green-600' : 'text-red-600'"
          >
            {{ fcmTestResult.message }}
          </p>
          <!-- 着信スケジュール設定 (展開時) -->
          <div v-if="expandedCallSettings.has(dev.id)" class="mt-3 ml-4 border-l-2 border-blue-200 pl-3">
            <CallScheduleSettings
              :model-value="editingSchedules[dev.id] || defaultSchedule"
              @update:model-value="updateScheduleForDevice(dev.id, $event)"
            />
            <button
              class="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
              @click="saveCallSchedule(dev)"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
