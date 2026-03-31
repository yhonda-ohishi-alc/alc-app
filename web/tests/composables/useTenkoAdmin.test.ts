import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('~/utils/api', () => ({
  getTenkoDashboard: vi.fn(),
  getEmployees: vi.fn(),
}))

import { useTenkoAdmin } from '~/composables/useTenkoAdmin'
import { getTenkoDashboard, getEmployees } from '~/utils/api'

describe('useTenkoAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初期値が正しい', () => {
    vi.mocked(getEmployees).mockResolvedValue([])
    vi.mocked(getTenkoDashboard).mockResolvedValue({
      pending_schedules: 0,
      active_sessions: 0,
      interrupted_sessions: 0,
      completed_today: 0,
      cancelled_today: 0,
      overdue_schedules: [],
    })

    const { dashboard, isLoading, error } = useTenkoAdmin()
    expect(dashboard.value).toBeNull()
    expect(isLoading.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('refresh でダッシュボードデータを取得', async () => {
    const mockDashboard = {
      pending_schedules: 3,
      active_sessions: 1,
      interrupted_sessions: 0,
      completed_today: 5,
      cancelled_today: 0,
      overdue_schedules: [],
    }
    vi.mocked(getEmployees).mockResolvedValue([])
    vi.mocked(getTenkoDashboard).mockResolvedValue(mockDashboard)

    const { refresh, dashboard } = useTenkoAdmin()
    await refresh()
    expect(dashboard.value).toEqual(mockDashboard)
  })

  it('refresh でエラー時にメッセージ設定', async () => {
    vi.mocked(getEmployees).mockResolvedValue([])
    vi.mocked(getTenkoDashboard).mockRejectedValue(new Error('network error'))

    const { refresh, error } = useTenkoAdmin()
    await refresh()
    expect(error.value).toBe('network error')
  })

  it('refresh でエラーが Error 以外の場合', async () => {
    vi.mocked(getEmployees).mockResolvedValue([])
    vi.mocked(getTenkoDashboard).mockRejectedValue('unknown')

    const { refresh, error } = useTenkoAdmin()
    await refresh()
    expect(error.value).toBe('取得エラー')
  })

  it('loadEmployees で従業員マップ構築', async () => {
    vi.mocked(getEmployees).mockResolvedValue([
      { id: 'emp-001', name: '田中太郎' },
      { id: 'emp-002', name: '鈴木花子' },
    ] as any)
    vi.mocked(getTenkoDashboard).mockResolvedValue({} as any)

    const { loadEmployees, employeeName, employees } = useTenkoAdmin()
    await loadEmployees()

    expect(employees.value).toHaveLength(2)
    expect(employeeName('emp-001')).toBe('田中太郎')
    expect(employeeName('emp-002')).toBe('鈴木花子')
  })

  it('employeeName で未知の ID は先頭8文字', () => {
    vi.mocked(getEmployees).mockResolvedValue([])
    vi.mocked(getTenkoDashboard).mockResolvedValue({} as any)

    const { employeeName } = useTenkoAdmin()
    expect(employeeName('abcdefgh-1234')).toBe('abcdefgh')
  })

  it('loadEmployees でエラーでもクラッシュしない', async () => {
    vi.mocked(getEmployees).mockRejectedValue(new Error('fail'))
    vi.mocked(getTenkoDashboard).mockResolvedValue({} as any)

    const { loadEmployees, employees } = useTenkoAdmin()
    await loadEmployees()
    expect(employees.value).toEqual([])
  })
})
