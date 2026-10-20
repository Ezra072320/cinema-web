import type { RevenueReport } from '../types/index.ts';

/** 日期运算用纯日期的UTC表示，不依赖浏览器所在时区或夏令时。 */
export function dateOffset(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function chinaToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function revenuePreset(key: string, today = chinaToday()): [string, string] {
  if (key === 'today') return [today, today];
  if (key === '7') return [dateOffset(today, -6), today];
  if (key === 'month') return [today.slice(0, 8) + '01', today];
  if (key === 'lastMonth') {
    const end = dateOffset(today.slice(0, 8) + '01', -1);
    return [end.slice(0, 8) + '01', end];
  }
  return [dateOffset(today, -29), today];
}
export function changePercent(current: number, previous: number): number | undefined {
  return previous === 0 ? undefined : (current - previous) / Math.abs(previous) * 100;
}
/** CSV对引号、换行和表格公式前缀均做处理，保留UTF-8 BOM供Excel打开中文。 */
export function csvText(rows: (string | number)[][]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value);
    if (typeof value === 'string' && /^\s*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}
export function revenueCsv(report: RevenueReport, kind: 'daily' | 'movies' | 'halls'): string {
  const rows: (string | number)[][] = [
    ['统计区间', report.startDate, report.endDate],
    ['统计口径', '按下单日期，退款回计原单；历史退款缺失或异常金额不计入收款与退款'],
    ['生成时间', report.generatedAt],
  ];
  if (kind === 'daily') {
    rows.push(['日期', '收款金额(元)', '实退金额(元)', '净营收(元)', '下单数', '付款订单数(含退款)', '退款订单数', '待支付单数', '已关闭单数', '旧退款待核实单数', '旧退款原单金额(元)']);
    for (const p of report.daily) {
      const m = p.metrics;
      rows.push([p.startDate, m.grossRevenue.toFixed(2), m.refundAmount.toFixed(2), m.netRevenue.toFixed(2),
        m.totalOrders, m.paidOrders, m.refundOrders, m.pendingOrders, m.closedOrders, m.unknownRefundOrders, m.unknownRefundOrderAmount.toFixed(2)]);
    }
  } else {
    rows.push([kind === 'movies' ? '影片(净营收前10)' : '影厅(净营收前10)', '付款订单数(含退款)', '收款金额(元)', '实退金额(元)', '净营收(元)', '占区间净营收(%)']);
    for (const r of report[kind]) rows.push([r.name, r.paidOrders, r.grossRevenue.toFixed(2), r.refundAmount.toFixed(2), r.netRevenue.toFixed(2), r.share.toFixed(2)]);
  }
  return csvText(rows);
}
