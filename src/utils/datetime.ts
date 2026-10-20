/**
 * 日期时间工具 —— 字符串切片为主, 不 new Date 解析(时区坑见 README):
 * 后端给的是 `yyyy-MM-dd HH:mm:ss` 或 ISO `yyyy-MM-ddTHH:mm:ss`, 本地时间直接用.
 */

/**
 * 时间拆成 { date, time }: 表格里日期是主信息, 时分淡显一档.
 * 后端可能给 `2026-10-16T12:34:56` 也可能给空串, 统一在这里兜住.
 */
export function timeParts(t?: string | null): { date: string; time: string } {
  const s = (t ?? '').replace('T', ' ');
  const i = s.indexOf(' ');
  return i < 0 ? { date: s, time: '' } : { date: s.slice(0, i), time: s.slice(i + 1) };
}

// ===== 时间展示(一律字符串切片, 不 new Date 解析排期字符串) =====

const WEEK_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 本地时钟的今天 "yyyy-MM-dd". 仅用于与后端墙钟字符串的日期部分做字符串比较. */
export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地时钟的明天 "yyyy-MM-dd". 只做日历加一天, 不解析排期字符串. */
export function localTomorrow(): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** 日期胶囊的最远日期 "yyyy-MM-dd" = 今天 +13 天(含今天共 14 天). 只做日历运算. */
export function localMaxDate(): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 13);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/**
 * 日期胶囊标签: "今天 · 10/19" / "明天 · 10/20" / "10/21 周二".
 * 星期用数字部分做日历运算 new Date(y, m-1, d).getDay() —— 不 new Date("yyyy-MM-dd"),
 * 后者会被当 UTC 零点解析再取本地星期, 跨时区会差一天.
 */
export function dateLabel(date: string): string {
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  if (date === localToday()) return `今天 · ${md}`;
  if (date === localTomorrow()) return `明天 · ${md}`;
  const [y, m, d] = date.split('-').map(Number);
  return `${md} ${WEEK_LABEL[new Date(y, m - 1, d).getDay()]}`;
}

/**
 * 场次开场时间展示: "yyyy-MM-dd HH:mm:ss"(后端 GMT+8 墙钟字符串) → "今天 HH:mm" / "M/D HH:mm".
 * 一律字符串切片, 不 new Date 解析 —— 按本地时区解析再格式化会把 16:00 后的场次挪到第二天
 * (同 admin/ScheduleManage、ScheduleTimeline 的约定).
 * 注意: "今天" 用的是用户本地时钟日期, 与 GMT+8 墙钟在跨时区环境下可能差一天, 与 admin 同口径, 不在本页修.
 */
export function formatStartTime(s: string): string {
  const hhmm = s.slice(11, 16); // 后端字符串已零填充, 直接切(顺带修掉旧版小时不补零)
  if (s.slice(0, 10) === localToday()) return `今天 ${hhmm}`;
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))} ${hhmm}`;
}

/**
 * 散场时间: 同 "散场 21:05"; 跨日场次(超长片/通宵场) → "散场 M/D HH:mm".
 * 同 formatStartTime —— 只切片不解析.
 */
export function formatEndTime(start: string, end: string): string {
  const hhmm = end.slice(11, 16);
  return end.slice(0, 10) > start.slice(0, 10)
    ? `散场 ${Number(end.slice(5, 7))}/${Number(end.slice(8, 10))} ${hhmm}`
    : `散场 ${hhmm}`;
}
