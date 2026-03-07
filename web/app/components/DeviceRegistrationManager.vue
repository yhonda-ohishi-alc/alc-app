<script setup lang="ts">
import QRCode from 'qrcode'
import type { Device, DeviceRegistrationRequest } from '~/types'
import {
  listDevices, listPendingDeviceRegistrations,
  createDeviceUrlToken, createPermanentQr,
  approveDevice, rejectDevice, disableDevice, enableDevice, deleteDevice,
} from '~/utils/api'

const devices = ref<Device[]>([])
const pending = ref<DeviceRegistrationRequest[]>([])
const loading = ref(false)
const error = ref('')

// URL トークン生成
const urlTokenName = ref('')
const generatedUrl = ref('')
const urlCopied = ref(false)

// QR一時生成
const qrTempName = ref('')
const qrTempCode = ref('')
const qrTempDataUrl = ref('')

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
        <img :src="qrTempDataUrl" alt="QR Temp" class="mx-auto" />
        <p class="text-xs text-gray-500">Code: {{ qrTempCode.slice(0, 8) }}...</p>
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

    <!-- 承認待ちリクエスト -->
    <div v-if="pending.length > 0" class="bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="px-4 py-3 bg-yellow-50 border-b">
        <h3 class="text-sm font-medium text-yellow-800">承認待ち ({{ pending.length }})</h3>
      </div>
      <div class="divide-y divide-gray-100">
        <div v-for="req in pending" :key="req.id" class="px-4 py-3 flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-800">{{ req.device_name || '(名前なし)' }}</p>
            <p class="text-xs text-gray-500">
              {{ req.flow_type === 'qr_permanent' ? 'QR永久' : req.flow_type === 'url' ? 'URL' : 'QR一時' }}
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
        <button class="text-xs text-blue-600 hover:underline" @click="refresh">更新</button>
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
                </p>
              </div>
            </div>
            <div class="flex gap-1">
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
        </div>
      </div>
    </div>
  </div>
</template>
