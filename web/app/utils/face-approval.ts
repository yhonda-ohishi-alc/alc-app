/** 顔承認ステータスチェック (共通ユーティリティ) */

const approvalMessages: Record<string, string> = {
  none: '顔データが未登録です',
  pending: '顔データは承認待ちです。管理者に承認を依頼してください',
  rejected: '顔データが却下されています。再登録してください',
}

/**
 * 従業員の顔承認ステータスをチェックする
 * @returns approved なら null、それ以外はエラーメッセージ
 */
export function checkFaceApproval(emp: { name: string; face_approval_status?: string }): string | null {
  if (emp.face_approval_status === 'approved') return null
  const msg = approvalMessages[emp.face_approval_status ?? 'none'] ?? '顔データが未承認です'
  return `${emp.name}さん: ${msg}`
}
