/**
 * 账号状态归一.
 *
 * 后端历史版本可能下发字符串枚举(NORMAL / DISABLED), 新版本下发数字(1 / 0).
 * 此前 MeLayout 与 UserInfo 各自写一份判断且口径不同, 未知状态值的显示会分叉.
 */
export function isAccountNormal(status?: string | number | null): boolean {
  return status === 'NORMAL' || Number(status) === 1;
}

export function isAccountDisabled(status?: string | number | null): boolean {
  return status === 'DISABLED' || Number(status) === 0;
}

export function accountStatusText(status?: string | number | null): string {
  if (isAccountNormal(status)) return '账号正常';
  if (isAccountDisabled(status)) return '账号停用';
  return '状态未知';
}

/**
 * 「2026 年 10 月加入」. 无效日期兜底「新用户」.
 * 之前在 MeLayout(formatJoin) 与 UserInfo(joinText) 各写一份.
 */
export function joinText(date?: string): string {
  if (!date) return '新用户';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '新用户';
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月加入`;
}

/**
 * 累计订单 = 各状态计数求和(1 待支付/2 已支付/3 已退款/4 已关闭/6 已完成).
 * 后端按状态下发的 map, key 是状态数字的字符串.
 */
export function totalOrderCount(counts: Record<string, unknown>): number {
  return ['1', '2', '3', '4', '6'].reduce((s, k) => s + (Number(counts[k]) || 0), 0);
}
