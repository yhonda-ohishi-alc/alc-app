import type { TenkoDashboard, ApiEmployee } from '~/types'
import { getTenkoDashboard, getEmployees } from '~/utils/api'

export function useTenkoAdmin() {
  const dashboard = ref<TenkoDashboard | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 従業員名ルックアップ (全コンポーネントで共有)
  const employeeMap = ref<Record<string, string>>({})
  const employees = ref<ApiEmployee[]>([])

  async function loadEmployees() {
    try {
      const list = await getEmployees()
      employees.value = list
      employeeMap.value = Object.fromEntries(list.map(e => [e.id, e.name]))
    } catch {}
  }

  function employeeName(id: string) {
    return employeeMap.value[id] || id.slice(0, 8)
  }

  async function refresh() {
    isLoading.value = true
    error.value = null
    try {
      dashboard.value = await getTenkoDashboard()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '取得エラー'
    } finally {
      isLoading.value = false
    }
  }

  onMounted(() => {
    loadEmployees()
    refresh()
  })

  return {
    dashboard,
    isLoading,
    error,
    employees,
    employeeMap,
    employeeName,
    loadEmployees,
    refresh,
  }
}
