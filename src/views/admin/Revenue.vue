<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Refresh, Download, ArrowRight, InfoFilled } from '@element-plus/icons-vue';
// ECharts 组件注册集中在 @/utils/chart(全站一份)
import { VChart } from '@/utils/chart';
import type { EChartsOption } from 'echarts';
import { statApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import type { RevenueMetrics, RevenueRank, RevenueReport } from '@/types';
import { CINEMA_DARK } from '@/styles/echarts-theme';
import { changePercent, chinaToday, revenueCsv, revenuePreset } from '@/utils/revenue';

const route = useRoute();
const auth = useAuthStore();
const exporting = ref(false);
async function downloadWorkbook() {
  if (!data.value || loading.value || error.value || exporting.value) return;
  const snapshot = data.value;
  exporting.value = true;
  try {
    const blob = await statApi.exportRevenue({ startDate: snapshot.startDate, endDate: snapshot.endDate, granularity: snapshot.granularity });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `营收报表_${snapshot.startDate}_${snapshot.endDate}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* Shared HTTP handler reports authentication and download errors. */ }
  finally { exporting.value = false; }
}
const router = useRouter();
const initial = revenuePreset('30');
const range = ref<[string, string] | null>(
  typeof route.query.start === 'string' && typeof route.query.end === 'string' ? [route.query.start, route.query.end] : initial,
);
const granularity = ref<'day' | 'week' | 'month'>(route.query.grain === 'week' || route.query.grain === 'month' ? route.query.grain : 'day');
const data = ref<RevenueReport | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);
const detailPage = ref(1);
const rankTab = ref('movies');
const pageSize = 15;
/* 订单构成环图/图例共用色板(与 legend 圆点一致) */
const STATUS_PIE_COLORS = ['#c9a96e', '#bb756b', '#648a95', '#545863', '#a890b3', '#898989'];
let sequence = 0;
const changed = computed(() => !!data.value && (range.value?.[0] !== data.value.startDate || range.value?.[1] !== data.value.endDate || granularity.value !== data.value.granularity));
const presets = [{ key: 'today', label: '今日' }, { key: '7', label: '近7天' }, { key: '30', label: '近30天' }, { key: 'month', label: '本月' }, { key: 'lastMonth', label: '上月' }];
const cards: { label: string; key: keyof RevenueMetrics; money: boolean; note: string }[] = [
  { label: '收款金额', key: 'grossRevenue', money: true, note: '含已退款订单原付款额' },
  { label: '实退金额', key: 'refundAmount', money: true, note: '按实际全额或部分退款' },
  { label: '付款订单', key: 'paidOrders', money: false, note: '含已退款订单，不含未付款' },
  { label: '平均每单收款', key: 'averageOrderValue', money: true, note: '收款金额 ÷ 付款订单' },
];
const dailyRows = computed(() => [...(data.value?.daily ?? [])].reverse().slice((detailPage.value - 1) * pageSize, detailPage.value * pageSize));
const displayedRanks = computed(() => data.value?.[rankTab.value === 'halls' ? 'halls' : 'movies'] ?? []);
const rankRowKey = (row: RevenueRank) => row.id ?? 'unknown';
function money(v: number) { return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function count(v: number) { return v.toLocaleString('zh-CN'); }
function shortMoney(v: number) { return Math.abs(v) >= 10000 ? (v / 10000).toFixed(1) + '万' : String(v); }
function comparison(key: keyof RevenueMetrics) {
  if (!data.value) return '';
  const value = changePercent(data.value.summary[key], data.value.previous[key]);
  if (value === undefined) return data.value.summary[key] === 0 ? '两期均为零' : '上期为零';
  return (value > 0 ? '↑ ' : value < 0 ? '↓ ' : '持平 ') + Math.abs(value).toFixed(1) + '%';
}
function disabledDate(date: Date) {
  const day = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  return day > chinaToday() || day < '2000-01-01';
}
function validRange() {
  if (!range.value?.[0] || !range.value?.[1]) { ElMessage.warning('请选择开始和结束日期'); return false; }
  const days = (Date.parse(range.value[1] + 'T00:00:00Z') - Date.parse(range.value[0] + 'T00:00:00Z')) / 86400000 + 1;
  if (!Number.isFinite(days) || days < 1 || days > 366 || range.value[1] > chinaToday() || range.value[0] < '2000-01-01') {
    ElMessage.warning('请选择2000年起、不晚于今天且不超过366天的日期区间'); return false;
  }
  return true;
}
async function load(refresh = false) {
  if (refresh && data.value) {
    range.value = [data.value.startDate, data.value.endDate];
    granularity.value = data.value.granularity;
  }
  if (!validRange() || !range.value) {
    if (!data.value) error.value = new Error('日期区间无效，请调整筛选后重新查询。');
    return;
  }
  const current = ++sequence;
  const params = { startDate: range.value[0], endDate: range.value[1], granularity: granularity.value };
  loading.value = true; error.value = null;
  try {
    const result = await statApi.revenue(params);
    if (current !== sequence) return;
    data.value = result; detailPage.value = 1;
    await router.replace({ query: { ...route.query, start: result.startDate, end: result.endDate, grain: result.granularity } });
  } catch (e) { if (current === sequence) error.value = e; }
  finally { if (current === sequence) loading.value = false; }
}
function preset(key: string) { range.value = revenuePreset(key); load(); }
function isPreset(key: string) { const r = revenuePreset(key); return range.value?.[0] === r[0] && range.value?.[1] === r[1]; }
function download(kind: 'daily' | 'movies' | 'halls') {
  if (!data.value || loading.value || error.value) return;
  const labels = { daily: '每日营收', movies: '影片排行', halls: '影厅排行' };
  const blob = new Blob([revenueCsv(data.value, kind)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = labels[kind] + '_' + data.value.startDate + '_' + data.value.endDate + '.csv';
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const trendOption = computed<EChartsOption>(() => {
  const rows = data.value?.trend ?? [];
  const large = rows.length > 45;
  const series = [
    { key: 'grossRevenue', name: '收款金额', color: '#7b9d92', area: false },
    { key: 'refundAmount', name: '实退金额', color: '#c87a70', area: false },
    { key: 'netRevenue', name: '净营收', color: '#c9a96e', area: true },
  ] as const;
  return {
    ...CINEMA_DARK,
    aria: { enabled: true, description: '所选日期区间的收款、退款与净营收走势，详细金额可在每日明细中查阅。' },
    tooltip: { ...CINEMA_DARK.tooltip, trigger: 'axis', valueFormatter: value => '¥' + money(Number(value)) },
    legend: { ...CINEMA_DARK.legend, top: 4, right: 10, itemWidth: 16, itemHeight: 7 },
    grid: { ...CINEMA_DARK.grid, top: 50, left: 12, right: 20, bottom: large ? 60 : 18 },
    xAxis: { type: 'category', boundaryGap: false, data: rows.map(r => r.label), axisLabel: { color: '#85858d', fontSize: 10, hideOverlap: true,
      formatter: label => label.includes(' ~ ') ? label.slice(5, 10) + '起' : label.slice(5) } },
    yAxis: { type: 'value', name: '元', axisLabel: { color: '#85858d', formatter: shortMoney }, splitLine: { lineStyle: { color: 'rgba(255,255,255,.05)' } } },
    dataZoom: large ? [{ type: 'slider', height: 18, bottom: 10, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,.03)', fillerColor: 'rgba(201,169,110,.12)', textStyle: { color: '#85858d' } }] : [],
    series: series.map(s => ({
      name: s.name, type: 'line', data: rows.map(r => r.metrics[s.key]), smooth: false,
      showSymbol: rows.length < 12, symbolSize: 6, lineStyle: { width: s.area ? 3 : 1.5, color: s.color },
      itemStyle: { color: s.color }, areaStyle: s.area ? { color: 'rgba(201,169,110,.08)' } : undefined,
    })),
  };
});
const statusOption = computed<EChartsOption>(() => ({
  ...CINEMA_DARK,
  aria: { enabled: true },
  legend: { show: false },
  tooltip: { ...CINEMA_DARK.tooltip, trigger: 'item', formatter: '{b}：{c} 单（{d}%）' },
  color: STATUS_PIE_COLORS,
  series: [{
    type: 'pie', radius: ['62%', '82%'], center: ['50%', '50%'], avoidLabelOverlap: true,
    label: { show: false }, itemStyle: { borderColor: '#181c23', borderWidth: 3 },
    data: (data.value?.statusDistribution ?? []).map((r, i) => ({
      ...r, itemStyle: { color: STATUS_PIE_COLORS[i] },
    })).filter(r => r.value > 0),
  }],
}));
onMounted(() => load());
onBeforeUnmount(() => { sequence++; });
</script>

<template>
  <div class="revenue-page">
    <header class="report-heading">
      <div><span class="eyebrow">CINEMA / BUSINESS REPORT</span><h1>营收报表<span class="heading-rule" /></h1><p>看清每一笔成交，也看见退款后的真实留存。</p></div>
      <div class="heading-actions">
        <el-button v-if="auth.can('report:export')" :icon="Download" :loading="exporting" :disabled="!data || loading || !!error" @click="downloadWorkbook">下载 Excel</el-button>
        <span v-if="data && !error" class="update-time">更新于 {{ data.generatedAt.slice(5, 16) }}</span>
        <el-button :icon="Refresh" :loading="loading" @click="load(true)">刷新数据</el-button>
        <el-dropdown :disabled="!data || loading || !!error" @command="download">
          <el-button :icon="Download" :disabled="!data || loading || !!error">导出报表</el-button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item command="daily">每日明细 CSV</el-dropdown-item><el-dropdown-item command="movies">影片排行 CSV</el-dropdown-item><el-dropdown-item command="halls">影厅排行 CSV</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
      </div>
    </header>

    <section class="report-filters cx-card" aria-label="营收筛选">
      <div class="date-presets"><button v-for="p in presets" :key="p.key" :class="{ active: isPreset(p.key) }" :disabled="loading" @click="preset(p.key)">{{ p.label }}</button></div>
      <div class="filter-fields">
        <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" :disabled-date="disabledDate" :disabled="loading" :clearable="false" aria-label="统计日期区间" />
        <el-select v-model="granularity" aria-label="趋势统计粒度" :disabled="loading"><el-option label="按日" value="day" /><el-option label="按周" value="week" /><el-option label="按月" value="month" /></el-select>
        <el-button type="primary" :loading="loading" @click="load()">查询报表</el-button>
      </div>
      <p v-if="changed" class="filter-pending" role="status">筛选已变更，点击“查询报表”更新数据。当前展示与导出仍对应下方区间。</p>
    </section>

    <PageSkeleton v-if="loading" :rows="4" :show-header="false" />
    <ErrorState v-else-if="error" :error="error" title="营收报表加载失败" @retry="load()" />
    <template v-else-if="data">
      <div class="period-heading"><strong>{{ data.startDate }} <el-icon><ArrowRight /></el-icon> {{ data.endDate }}</strong><span>上期对照：{{ data.previousStartDate }} 至 {{ data.previousEndDate }}<template v-if="data.endDate === chinaToday()"> · 今日尚未结束</template></span></div>
      <section class="summary-grid" aria-label="营收指标">
        <article class="net-card cx-card">
          <div class="net-label"><span class="indicator" />区间净营收 <el-tooltip content="已确认收款金额减实际退款金额。按订单下单日期归属，退款回计原单日期，不代表支付日现金流或利润。"><el-icon tabindex="0" aria-label="净营收计算说明"><InfoFilled /></el-icon></el-tooltip></div>
          <div class="net-value"><span>¥</span>{{ money(data.summary.netRevenue) }}</div>
          <p class="net-equation">收款 ¥{{ money(data.summary.grossRevenue) }} <span>−</span> 退款 ¥{{ money(data.summary.refundAmount) }}</p>
          <footer><span>较上期 <strong>{{ comparison('netRevenue') }}</strong></span><span>区间下单 {{ count(data.summary.totalOrders) }} 笔</span></footer>
        </article>
        <div class="metric-grid">
          <article v-for="c in cards" :key="c.key" class="metric-card cx-card"><div class="metric-label">{{ c.label }}<span class="metric-change">{{ comparison(c.key) }}</span></div><strong><small v-if="c.money">¥</small>{{ c.money ? money(data.summary[c.key]) : count(data.summary[c.key]) }}</strong><p>{{ c.note }}</p></article>
        </div>
      </section>
      <div v-if="data.summary.unknownRefundOrders" class="data-notice" role="status"><el-icon><InfoFilled /></el-icon><p>有 <strong>{{ data.summary.unknownRefundOrders }}</strong> 笔旧退款订单的实退金额缺失或异常，原单金额合计 ¥{{ money(data.summary.unknownRefundOrderAmount) }}，未计入收款、退款及净营收；订单数仍保留。</p></div>

      <section class="analysis-grid">
        <article class="report-panel cx-card trend-panel"><header class="panel-heading"><div><span class="section-number">01</span><h2>营收走势</h2></div><span>{{ { day: '每日', week: '每周', month: '每月' }[data.granularity] }}汇总 · {{ data.trend.length }} 个数据点</span></header><v-chart :option="trendOption" autoresize class="trend-chart" /><p v-if="!data.summary.totalOrders" class="zero-hint">该区间暂无订单，所有日期已补零展示。</p></article>
        <article class="report-panel cx-card status-panel"><header class="panel-heading"><div><span class="section-number">02</span><h2>订单构成</h2></div><span>按笔数</span></header>
          <div v-if="data.summary.totalOrders" class="donut-wrap"><v-chart :option="statusOption" autoresize class="donut-chart" /><div class="donut-center"><strong>{{ count(data.summary.totalOrders) }}</strong><span>区间下单</span></div></div><div v-else class="no-orders">暂无订单</div>
          <div class="status-legend"><div v-for="(r, i) in data.statusDistribution" :key="r.name"><span><i :style="{ background: STATUS_PIE_COLORS[i] }" />{{ r.name }}</span><strong>{{ count(r.value) }}</strong></div></div>
          <footer class="refund-rate"><span>退款订单占付款订单</span><strong>{{ data.summary.refundRate.toFixed(2) }}%</strong></footer>
        </article>
      </section>

      <section class="report-panel cx-card rank-panel"><header class="panel-heading"><div><span class="section-number">03</span><h2>营收贡献</h2></div><span>按区间净营收排序 · 最多 10 项</span></header>
        <el-tabs v-model="rankTab"><el-tab-pane label="影片排行" name="movies" /><el-tab-pane label="影厅排行" name="halls" /></el-tabs>
        <el-table :data="displayedRanks" empty-text="该区间暂无已确认的付款订单" :row-key="rankRowKey">
          <el-table-column label="排名" width="68"><template #default="{ $index }"><span class="rank-index" :class="{ podium: $index < 3 }">{{ String($index + 1).padStart(2, '0') }}</span></template></el-table-column>
          <el-table-column prop="name" :label="rankTab === 'movies' ? '影片' : '影厅'" min-width="180" show-overflow-tooltip />
          <el-table-column prop="paidOrders" label="付款订单" min-width="100" align="right" />
          <el-table-column label="收款金额" min-width="125" align="right"><template #default="{ row }">¥{{ money(row.grossRevenue) }}</template></el-table-column>
          <el-table-column label="实退金额" min-width="125" align="right"><template #default="{ row }"><span class="refund-text">¥{{ money(row.refundAmount) }}</span></template></el-table-column>
          <el-table-column label="净营收" min-width="135" align="right"><template #default="{ row }"><strong class="gold">¥{{ money(row.netRevenue) }}</strong></template></el-table-column>
          <el-table-column label="区间净营收占比" min-width="145" align="right"><template #default="{ row }"><div class="share-cell"><i><b :style="{ width: row.share + '%' }" /></i><span>{{ row.share.toFixed(1) }}%</span></div></template></el-table-column>
        </el-table>
      </section>

      <section class="report-panel cx-card daily-panel"><header class="panel-heading"><div><span class="section-number">04</span><h2>每日明细</h2></div><el-button text :icon="Download" @click="download('daily')">导出全部 {{ data.daily.length }} 天</el-button></header>
        <el-table :data="dailyRows" row-key="startDate" stripe>
          <el-table-column prop="startDate" label="下单日期" width="130" />
          <el-table-column label="收款金额" min-width="130" align="right"><template #default="{ row }">¥{{ money(row.metrics.grossRevenue) }}</template></el-table-column>
          <el-table-column label="实退金额" min-width="125" align="right"><template #default="{ row }">¥{{ money(row.metrics.refundAmount) }}</template></el-table-column>
          <el-table-column label="净营收" min-width="135" align="right"><template #default="{ row }"><strong class="gold">¥{{ money(row.metrics.netRevenue) }}</strong></template></el-table-column>
          <el-table-column prop="metrics.totalOrders" label="下单数" min-width="85" align="right" />
          <el-table-column prop="metrics.paidOrders" label="付款单数" min-width="100" align="right" />
          <el-table-column prop="metrics.refundOrders" label="退款单数" min-width="100" align="right" />
          <el-table-column prop="metrics.unknownRefundOrders" label="旧退款待核实" min-width="115" align="right" />
        </el-table>
        <div class="daily-footer"><span>共 {{ data.daily.length }} 天 · 全区间净营收 <strong>¥{{ money(data.summary.netRevenue) }}</strong></span><el-pagination v-model:current-page="detailPage" :page-size="pageSize" :total="data.daily.length" layout="prev, pager, next" /></div>
      </section>
      <footer class="report-notes"><h3><el-icon><InfoFilled /></el-icon>统计口径</h3><p>按下单日期汇总截至更新时的订单状态，退款回计原单；净营收 = 已确认收款 − 实际退款。待支付、已关闭订单不产生收入。付款订单包含已退款订单，平均每单收款按退款前金额计算。</p><p>周汇总以周一为起点，首尾仅覆盖所选区间；上期为紧邻且等长的区间。历史退款金额缺失或异常的订单单独列示，未计入金额统计。本报表不代表支付日现金流或利润，退款后重查历史区间时金额会随之更新。</p></footer>
    </template>
  </div>
</template>

<style scoped lang="scss">
.revenue-page { display: flex; flex-direction: column; gap: 22px; min-width: 0; font-variant-numeric: tabular-nums; }
.report-heading { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 20px; padding: 5px 0 3px;
  h1 { font-family: 'STSong', 'Songti SC', serif; font-size: 32px; font-weight: 500; letter-spacing: 3px; margin: 9px 0; display: flex; align-items: center; gap: 20px; }
  p { margin: 0; color: var(--cx-text-muted); font-size: 12px; line-height: 1.8; }
}
.eyebrow { color: var(--cx-color-primary); font-size: 9px; letter-spacing: 2.3px; }
.heading-rule { display: inline-block; width: 48px; height: 1px; background: var(--cx-color-primary); opacity: .4; }
.heading-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; .el-button + .el-button { margin-left: 0; } }
.update-time { color: var(--cx-text-muted); font-size: 10px; margin-right: 3px; }
.report-filters { padding: 16px 20px; display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.date-presets { display: flex; gap: 3px; padding: 3px; border: 1px solid var(--cx-border); border-radius: 6px;
  button { background: transparent; color: var(--cx-text-secondary); font: inherit; font-size: 12px; border: 0; border-radius: 4px; padding: 7px 12px; cursor: pointer; white-space: nowrap; transition: color .15s, background .15s; &:hover { color: var(--cx-color-primary); } &.active { background: color-mix(in srgb, var(--cx-color-primary) 12%, transparent); color: var(--cx-color-primary); } &:disabled { cursor: wait; opacity: .6; } }
}
.filter-fields { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-left: auto; min-width: 0; :deep(.el-date-editor) { width: 280px; flex-grow: 0; } .el-select { width: 85px; } }
.filter-pending { flex-basis: 100%; color: var(--cx-color-primary); font-size: 11px; margin: 0; }
.period-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; justify-content: space-between; strong { display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 500; .el-icon { color: var(--cx-color-primary); } } > span { color: var(--cx-text-muted); font-size: 10px; } }
.summary-grid { display: grid; grid-template-columns: minmax(0,1.05fr) minmax(0,1.6fr); gap: 16px; }
.net-card { display: flex; flex-direction: column; padding: 28px; border-top: 2px solid var(--cx-color-primary); background: linear-gradient(120deg,color-mix(in srgb, var(--cx-color-primary) 4.5%, transparent),transparent 70%),var(--cx-bg-elevated); min-width: 0; }
.net-label { color: var(--cx-text-secondary); font-size: 12px; display: flex; align-items: center; gap: 8px; .el-icon { color: var(--cx-text-muted); } }
.indicator { display: inline-block; width: 5px; height: 5px; background: var(--cx-color-primary); border-radius: 50%; }
.net-value { font-family: Georgia, 'Songti SC', serif; color: var(--cx-color-primary); font-size: clamp(30px,3.1vw,48px); line-height: 1.3; margin: 23px 0 10px; overflow-wrap: anywhere; span { font-size: 22px; margin-right: 6px; } }
.net-equation { font-size: 11px; color: var(--cx-text-muted); margin: 0 0 25px; line-height: 1.8; span { margin: 0 6px; } }
.net-card footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 17px; border-top: 1px solid var(--cx-border); font-size: 10px; color: var(--cx-text-muted); strong { color: var(--cx-color-primary); font-weight: 500; margin-left: 6px; } }
.metric-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.metric-card { padding: 20px 22px; min-width: 0; > strong { display: block; font-size: clamp(20px,2vw,28px); font-weight: 500; margin-top: 13px; overflow-wrap: anywhere; small { font-size: 13px; margin-right: 4px; color: var(--cx-text-muted); } } p { color: var(--cx-text-muted); font-size: 10px; margin: 10px 0 0; } }
.metric-label { color: var(--cx-text-secondary); font-size: 11px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 5px; }
.metric-change { color: var(--cx-text-muted); font-size: 10px; }
.data-notice { display: flex; gap: 10px; align-items: center; padding: 12px 16px; color: #d5b887; border: 1px solid color-mix(in srgb, var(--cx-color-primary) 20%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--cx-color-primary) 4%, transparent); p { font-size: 12px; line-height: 1.8; margin: 0; } > .el-icon { flex: none; } }
.analysis-grid { display: grid; grid-template-columns: minmax(0,1.9fr) minmax(290px,1fr); gap: 16px; align-items: stretch; }
.report-panel { padding: 22px 24px; min-width: 0; overflow: hidden; }
.panel-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; > div { display: flex; align-items: center; gap: 10px; } h2 { font-size: 15px; font-weight: 500; margin: 0; } > span { color: var(--cx-text-muted); font-size: 10px; } .el-button { font-size: 11px; } }
.section-number { color: var(--cx-color-primary); font-family: Georgia,serif; font-size: 12px; opacity: .65; }
.trend-chart { height: 330px; }
.zero-hint { color: var(--cx-text-muted); font-size: 11px; text-align: center; margin: 0; }
.donut-wrap { position: relative; height: 180px; }
.donut-chart { height: 180px; }
.donut-center { position: absolute; inset: 0; pointer-events: none; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 6px; strong { font-family: Georgia,serif; font-size: 29px; font-weight: 400; } span { font-size: 10px; color: var(--cx-text-muted); } }
.no-orders { height: 150px; display: grid; place-items: center; color: var(--cx-text-muted); font-size: 13px; }
.status-legend { display: grid; gap: 9px; margin: 12px 0 20px; > div { display: flex; justify-content: space-between; align-items: center; font-size: 11px; } span { color: var(--cx-text-secondary); display: flex; align-items: center; gap: 7px; } i { width: 5px; height: 5px; border-radius: 50%; } strong { font-weight: 500; } }
.refund-rate { display: flex; justify-content: space-between; padding-top: 15px; border-top: 1px solid var(--cx-border); font-size: 10px; color: var(--cx-text-muted); strong { color: #c87a70; font-size: 13px; font-weight: 500; } }
.rank-panel :deep(.el-tabs__header) { margin-bottom: 8px; }
.rank-index { color: var(--cx-text-muted); font-family: Georgia,serif; font-size: 14px; &.podium { color: var(--cx-color-primary); } }
.gold { color: var(--cx-color-primary); font-weight: 500; }
.refund-text { color: var(--cx-text-secondary); }
.share-cell { display: flex; align-items: center; gap: 10px; justify-content: flex-end; span { width: 44px; font-size: 11px; } i { width: 55px; height: 3px; background: rgba(255,255,255,.05); border-radius: 3px; overflow: hidden; } b { display: block; height: 100%; background: var(--cx-color-primary); } }
.daily-footer { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-top: 20px; flex-wrap: wrap; > span { color: var(--cx-text-muted); font-size: 11px; strong { color: var(--cx-text-secondary); font-weight: 500; margin-left: 4px; } } }
.report-notes { padding: 0 3px 12px; h3 { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 500; color: var(--cx-text-secondary); margin: 0 0 8px; } p { font-size: 10px; color: var(--cx-text-muted); line-height: 1.9; margin: 4px 0; } }
@media(max-width:1200px) { .summary-grid { grid-template-columns: minmax(0,1fr); } .net-card { padding: 24px; } .net-value { margin-top: 15px; } .metric-grid { grid-template-columns: repeat(4,minmax(0,1fr)); } .metric-card { padding: 18px 15px; } .analysis-grid { grid-template-columns: minmax(0,1.7fr) minmax(260px,1fr); } .filter-fields { margin-left: 0; } }
@media(max-width:960px) { .metric-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .analysis-grid { grid-template-columns: minmax(0,1fr); } .status-panel { display: grid; grid-template-columns: 180px minmax(0,1fr); gap: 0 20px; .panel-heading { grid-column: 1 / -1; } .refund-rate { grid-column: 1 / -1; } } .status-legend { align-self: center; } }
@media(max-width:600px) { .report-heading h1 { font-size: 28px; } .heading-actions { width: 100%; .update-time { flex-basis: 100%; } } .report-filters { padding: 14px; } .date-presets { width: 100%; justify-content: space-between; button { padding: 7px 10px; } } .filter-fields { width: 100%; :deep(.el-date-editor) { width: 100%; flex-basis: 100%; } } .period-heading { gap: 8px; } .metric-card { padding: 16px 13px; } .report-panel { padding: 18px 14px; } .net-card { padding: 22px; } .net-value { font-size: 38px; } .net-equation { font-size: 10px; } .status-panel { grid-template-columns: 130px minmax(0,1fr); gap: 0 12px; } .donut-wrap,.donut-chart { height: 155px; } .donut-center strong { font-size: 24px; } .daily-footer { justify-content: center; } }
</style>
