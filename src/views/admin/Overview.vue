<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
// ECharts 组件注册集中在 @/utils/chart(全站一份, 含 AriaComponent)
import { VChart } from '@/utils/chart';
import { ArrowRight, Calendar, House, Tickets, VideoCamera } from '@element-plus/icons-vue';
import { statApi } from '@/api';
import { CINEMA_DARK } from '@/styles/echarts-theme';
import type { OverviewStat } from '@/types';

const data = ref<OverviewStat | null>(null);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    data.value = await statApi.overview();
  } catch {
    // 业务/网络错误由 http 拦截器统一弹 toast(D8)
  } finally {
    loading.value = false;
  }
}

// ===== 头部与格式化 =====

const todayText = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

/** 本地日期串, 用于判断趋势末点是不是今天(不用 toISOString —— 那是 UTC 会错位一天). */
function localDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function money(v: number): string {
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function compactMoney(v: number): string {
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : money(v);
}

// ===== KPI 环比(今日 vs 昨日, 从 7 天趋势推导) =====

const trend = computed(() => data.value?.revenueTrend ?? []);
const lastPoint = computed(() => trend.value.at(-1));
const prevPoint = computed(() => trend.value.at(-2));
/** 趋势末点确为今天时才显示环比, 避免拿昨天冒充今天. */
const trendEndsToday = computed(() => lastPoint.value?.date === localDateStr());

function deltaPercent(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return ((current - previous) / previous) * 100;
}

const revenueDelta = computed(() =>
  trendEndsToday.value && prevPoint.value && data.value
    ? deltaPercent(data.value.todayRevenue, prevPoint.value.revenue)
    : undefined,
);
const ordersDelta = computed(() =>
  trendEndsToday.value && prevPoint.value && data.value
    ? deltaPercent(data.value.todayOrders, prevPoint.value.orders)
    : undefined,
);

// ===== 快捷入口 =====

const quickLinks = [
  { to: '/manage/movies', icon: VideoCamera, label: '影片管理', desc: '同步、补缺与资料核实' },
  { to: '/manage/schedules', icon: Calendar, label: '排片管理', desc: '时间轴拖拽改期与批量排片' },
  { to: '/manage/orders', icon: Tickets, label: '订单管理', desc: '订单查询与详情核对' },
  { to: '/manage/halls', icon: House, label: '影厅管理', desc: '影厅与座位图草稿/发布' },
];

// ===== 图表 =====

const trendOption = computed(() => ({
  ...CINEMA_DARK,
  grid: { ...CINEMA_DARK.grid, top: 56 },
  title: { ...CINEMA_DARK.title, text: '最近 7 天净营收与订单' },
  legend: { ...CINEMA_DARK.legend, top: 8 },
  tooltip: {
    ...CINEMA_DARK.tooltip,
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
  },
  xAxis: {
    type: 'category',
    data: trend.value.map((r) => r.date.slice(5)),
    axisLabel: { color: '#a1a1aa' },
  },
  yAxis: [
    {
      type: 'value',
      name: '营收(¥)',
      axisLabel: { color: '#a1a1aa', formatter: (v: number) => compactMoney(v) },
    },
    { type: 'value', name: '订单数', axisLabel: { color: '#a1a1aa' } },
  ],
  series: [
    {
      name: '营收',
      type: 'line',
      smooth: true,
      data: trend.value.map((r) => r.revenue),
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(201, 169, 110, 0.3)' },
            { offset: 1, color: 'rgba(201, 169, 110, 0)' },
          ],
        },
      },
      lineStyle: { color: '#c9a96e', width: 2 },
      itemStyle: { color: '#c9a96e' },
    },
    {
      name: '订单数',
      type: 'bar',
      yAxisIndex: 1,
      data: trend.value.map((r) => r.orders),
      itemStyle: {
        color: 'rgba(124, 29, 63, 0.5)',
        borderRadius: [4, 4, 0, 0],
      },
    },
  ],
}));

const topOption = computed(() => ({
  ...CINEMA_DARK,
  title: { ...CINEMA_DARK.title, text: '累计净营收 Top 5' },
  /* 主题已开 containLabel, 长片名自动撑开, 不再手写 left 补丁 */
  grid: { ...CINEMA_DARK.grid, left: 16 },
  tooltip: {
    ...CINEMA_DARK.tooltip,
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    valueFormatter: (v: number) => `¥${compactMoney(v)}`,
  },
  xAxis: {
    type: 'value',
    axisLabel: { color: '#a1a1aa', formatter: (v: number) => compactMoney(v) },
  },
  yAxis: {
    type: 'category',
    data: (data.value?.topMovies ?? []).slice(0, 5).map((m) => m.title).reverse(),
    axisLabel: { color: '#a1a1aa', width: 110, overflow: 'truncate' },
  },
  series: [
    {
      name: '票房',
      type: 'bar',
      data: (data.value?.topMovies ?? []).slice(0, 5).map((m) => m.boxOffice).reverse(),
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [
            { offset: 0, color: '#7c1d3f' },
            { offset: 1, color: '#c9a96e' },
          ],
        },
        borderRadius: [0, 4, 4, 0],
      },
    },
  ],
}));

const pieOption = computed(() => ({
  ...CINEMA_DARK,
  title: { ...CINEMA_DARK.title, text: '影片类型分布' },
  legend: {
    ...CINEMA_DARK.legend,
    bottom: 0,
    icon: 'circle',
    itemWidth: 8,
    itemHeight: 8,
  },
  series: [
    {
      name: '类型',
      type: 'pie',
      radius: ['42%', '64%'],
      center: ['50%', '46%'],
      data: data.value?.typeDistribution ?? [],
      label: { show: false },
      emphasis: {
        label: { show: true, color: '#f4f4f5', fontWeight: 600 },
      },
      itemStyle: { borderColor: '#0f1419', borderWidth: 2 },
    },
  ],
}));

/** 空数据时给图表占位, 用户能分清「没数据」和「没加载」 */
const hasTrend = computed(() => trend.value.length > 0);
const hasTop = computed(() => (data.value?.topMovies ?? []).length > 0);
const hasDist = computed(() => (data.value?.typeDistribution ?? []).length > 0);

onMounted(load);
</script>

<template>
  <div class="overview">
    <header class="header">
      <div>
        <h1 class="title">影院概览</h1>
        <p class="subtitle">{{ todayText }} · 按下单日期统计，退款回计原单</p>
      </div>
      <el-button round @click="load">刷新数据</el-button>
    </header>

    <PageSkeleton v-if="loading" :rows="3" :show-header="false" />

    <template v-else-if="data">
      <section class="kpi">
        <StatCard
          label="今日订单净营收"
          :value="`¥${money(data.todayRevenue)}`"
          :hint="revenueDelta !== undefined ? 'vs 昨日' : '当日'"
          :trend="revenueDelta"
          accent="gold"
        />
        <StatCard
          label="今日订单"
          :value="money(data.todayOrders)"
          :hint="ordersDelta !== undefined ? 'vs 昨日' : '当日'"
          :trend="ordersDelta"
          accent="wine"
        />
        <StatCard
          label="累计净营收"
          :value="`¥${money(data.totalRevenue)}`"
          hint="累计"
          accent="blue"
        />
        <StatCard label="总订单" :value="money(data.totalOrders)" hint="累计" accent="green" />
        <StatCard label="在库影片" :value="money(data.totalMovies)" hint="部" accent="gold" />
        <StatCard label="累计排片" :value="money(data.totalSchedules)" hint="场" accent="wine" />
      </section>

      <section class="charts">
        <el-card class="chart-card cx-glass">
          <v-chart v-if="hasTrend" :option="trendOption" autoresize style="height: var(--cx-chart-h)" />
          <EmptyState v-else title="暂无营收数据" hint="有成交订单后会自动出现在这里" />
        </el-card>
        <el-card class="chart-card cx-glass">
          <v-chart v-if="hasDist" :option="pieOption" autoresize style="height: var(--cx-chart-h)" />
          <EmptyState v-else title="暂无类型分布" hint="影片同步后会按类型统计" />
        </el-card>
        <el-card class="chart-card cx-glass full">
          <v-chart v-if="hasTop" :option="topOption" autoresize style="height: var(--cx-chart-h)" />
          <EmptyState v-else title="暂无票房数据" hint="有售出记录后会生成榜单" />
        </el-card>
      </section>

      <section class="quick-links">
        <RouterLink v-for="l in quickLinks" :key="l.to" :to="l.to" class="quick-card cx-card">
          <span class="quick-icon"><el-icon :size="20"><component :is="l.icon" /></el-icon></span>
          <span class="quick-meta">
            <strong>{{ l.label }}</strong>
            <span>{{ l.desc }}</span>
          </span>
          <el-icon class="quick-arrow"><ArrowRight /></el-icon>
        </RouterLink>
      </section>
    </template>

    <ErrorState v-else @retry="load" />
  </div>
</template>

<style scoped lang="scss">
.overview {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-5);
}

.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cx-space-3);
  flex-wrap: wrap;

  .title {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .subtitle {
    color: var(--cx-text-muted);
    font-size: 13px;
    margin: 4px 0 0;
  }
}

.kpi {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--cx-space-4);
}

.charts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--cx-space-4);
}

.chart-card {
  padding: var(--cx-space-4);

  &.full {
    grid-column: 1 / -1;
  }
}

/* ===== 快捷入口 ===== */

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--cx-space-4);
}

.quick-card {
  display: flex;
  align-items: center;
  gap: var(--cx-space-3);
  padding: var(--cx-space-4);
  color: inherit;

  &:hover .quick-arrow {
    transform: translateX(3px);
    color: var(--cx-color-primary);
  }
}

.quick-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cx-radius-md);
  background: color-mix(in srgb, var(--cx-color-primary) 12%, transparent);
  color: var(--cx-color-primary);
}

.quick-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 14px;
    color: var(--cx-text-primary);
  }
  span {
    font-size: 12px;
    color: var(--cx-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.quick-arrow {
  margin-left: auto;
  color: var(--cx-text-muted);
  transition:
    transform var(--cx-duration-fast) var(--cx-ease),
    color var(--cx-duration-fast) var(--cx-ease);
}

@media (max-width: 1024px) {
  .charts {
    grid-template-columns: 1fr;
  }
}
</style>
