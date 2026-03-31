import { describe, it, expect } from 'vitest'
import { checkFaceApproval } from '~/utils/face-approval'

describe('checkFaceApproval', () => {
  it('approved なら null を返す', () => {
    expect(checkFaceApproval({ name: '田中', face_approval_status: 'approved' })).toBeNull()
  })

  it('none なら未登録メッセージ', () => {
    const msg = checkFaceApproval({ name: '田中', face_approval_status: 'none' })
    expect(msg).toBe('田中さん: 顔データが未登録です')
  })

  it('pending なら承認待ちメッセージ', () => {
    const msg = checkFaceApproval({ name: '鈴木', face_approval_status: 'pending' })
    expect(msg).toContain('承認待ち')
  })

  it('rejected なら却下メッセージ', () => {
    const msg = checkFaceApproval({ name: '佐藤', face_approval_status: 'rejected' })
    expect(msg).toContain('却下')
  })

  it('face_approval_status が undefined なら未登録扱い', () => {
    const msg = checkFaceApproval({ name: '高橋' })
    expect(msg).toContain('未登録')
  })

  it('未知のステータスはデフォルトメッセージ', () => {
    const msg = checkFaceApproval({ name: '山田', face_approval_status: 'unknown_status' })
    expect(msg).toBe('山田さん: 顔データが未承認です')
  })
})
