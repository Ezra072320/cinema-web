/**
 * 订单相关工具.
 *
 * 退款预计金额(refundPreview): 与后端 OrderServiceImpl.refund 完全同口径
 * (>6h 全额、3-6h 70% HALF_UP、<3h 不可退), 仅为前端弹窗展示用.
 * **后端为准** —— 改了退款规则要两边同步.
 */

export type RefundPreview =
  | { kind: 'full'; amount: number; minutesLeft: number }
  | { kind: 'partial'; amount: number; minutesLeft: number }
  | { kind: 'deny'; reason: string; minutesLeft: number };

export function refundPreview(startTime: string, totalAmount: number, now = new Date()): RefundPreview {
  const start = new Date(startTime);
  const minutesLeft = Math.floor((start.getTime() - now.getTime()) / 60000);
  if (minutesLeft < 180) {
    return { kind: 'deny', reason: '距开场不足 3 小时, 不可退款', minutesLeft };
  }
  if (minutesLeft > 360) {
    return { kind: 'full', amount: totalAmount, minutesLeft };
  }
  // 3-6h 档: 70% 四舍五入到分. 与后端 setScale(2, HALF_UP) 一致.
  const amount = Math.round(totalAmount * 0.7 * 100) / 100;
  return { kind: 'partial', amount, minutesLeft };
}

export function minutesToReadable(m: number): string {
  if (m < 0) return '已开场';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm} 分钟`;
  if (mm <= 0) return `${h} 小时`;
  return `${h} 小时 ${mm} 分钟`;
}
