<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { userApi } from '@/api';
import { ORDER_STATUS_NUM, type OrderInfo } from '@/types';
import { useOrderActions } from '@/composables/useOrderActions';

const route = useRoute();
const router = useRouter();

const status = computed(() => Number(route.params.status ?? 0));
const list = ref<OrderInfo[]>([]);
const loading = ref(true);

/**
 * 订单接口一次返回全量数据. 重度用户「全部」页签会一次渲染几十张含海报的卡片,
 * 这里做客户端分页控制单页 DOM 数量.
 */
const PAGE_SIZE = 6;
const page = ref(1);
const pagedList = computed(() =>
  list.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);

// tab value 对应后端订单状态: 1 待支付 / 2 已支付 / 3 已退款 / 4 已关闭 / 5 全部(查询哨兵).
const TABS = [
  { value: 1, label: '待支付' },
  { value: 2, label: '已支付' },
  { value: 3, label: '已退款' },
  { value: 4, label: '已关闭' },
  { value: 6, label: '已完成' },
  { value: 5, label: '全部' },
] as const;

/** 修复: 早先 el-tab-pane @click 落在内容面板上, 页签实际不切换. 改用 el-tabs @tab-click. */
function onTabClick(tab: { paneName: string | number }) {
  router.replace({ params: { status: String(tab.paneName) } });
}

async function load() {
  loading.value = true;
  try {
    list.value = await userApi.orders(status.value);
    // 退款/取消后当前页可能已越界, 钳回最后一页
    const maxPage = Math.max(1, Math.ceil(list.value.length / PAGE_SIZE));
    if (page.value > maxPage) page.value = maxPage;
  } catch {
    // 业务错误由 http 拦截器统一弹 toast, 页面不重弹(D8)
  } finally {
    loading.value = false;
  }
}

// 退款/取消流程(确认弹窗 + 调用 + 提示)与订单详情页共用 useOrderActions
const { refunding, cancelling, refund, cancelOrder } = useOrderActions({
  onRefunded: load,
  onCancelled: load,
});

function goPay(o: OrderInfo) { router.push({ name: 'pay', params: { orderId: o.id } }); }
function goDetail(o: OrderInfo) { router.push({ name: 'order-info', params: { orderId: o.id } }); }
function goScore(o: OrderInfo) {
  // 2026-10-19 修复: 用后端下发的 movieId 替代 0 兜底, 不再是"占位 0"
  router.push({ name: 'score', params: { movieId: o.movieId ?? 0, orderId: o.id } });
}

interface StatusView { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'mute'; }
function statusInfo(o: OrderInfo): StatusView {
  if (o.transactionState === 'PROCESSING') return { label: '订单确认中', tone: 'warning' };
  const s = Number(o.status);
  const label = ORDER_STATUS_NUM[s] ?? '未知';
  if (s === 2 || s === 6) return { label, tone: 'success' };
  if (s === 1) return { label, tone: 'warning' };
  if (s === 4) return { label, tone: 'mute' };
  if (s === 3) return { label, tone: 'info' };
  return { label, tone: 'mute' };
}

function payChannelLabel(c?: string) {
  if (!c) return null;
  const m: Record<string, string> = { WECHAT: '微信', ALIPAY: '支付宝', CARD: '银行卡' };
  return m[c] ?? c;
}

watch(status, () => {
  page.value = 1;
  load();
});
onMounted(load);
</script>

<template>
  <div class="orders">
    <header class="head">
      <div>
        <h1 class="title">我的订单</h1>
        <p class="subtitle">查看全部购票记录与状态</p>
      </div>
      <div class="head-meta">{{ list.length }} 条记录</div>
    </header>

    <el-tabs :model-value="status" class="tabs" @tab-click="onTabClick">
      <el-tab-pane v-for="t in TABS" :key="t.value" :label="t.label" :name="t.value" />
    </el-tabs>

    <PageSkeleton v-if="loading" :rows="3" :show-header="false" />

    <EmptyState
      v-else-if="!list.length"
      title="暂无订单"
      hint="下单后会自动出现在这里"
    >
      <template #actions>
        <el-button type="primary" @click="router.push('/movie')">去看看有什么热映</el-button>
      </template>
    </EmptyState>

    <div v-else class="list">
      <article
        v-for="o in pagedList"
        :key="o.id"
        class="order-card cx-card"
        :class="`is-${statusInfo(o).tone}`"
      >
        <div class="poster-wrap">
          <PosterImage :src="o.poster" :alt="o.movieName" :initial="o.movieName?.charAt(0)" />
          <span class="poster-shade" aria-hidden="true" />
        </div>

        <div class="info">
          <div class="info-top">
            <h3 class="movie">{{ o.movieName }}</h3>
            <span class="status-pill" :class="`is-${statusInfo(o).tone}`">
              {{ statusInfo(o).label }}
            </span>
          </div>

          <p class="meta">
            <span class="meta-icon">●</span>
            {{ o.hallName }}
            <span class="sep">|</span>
            {{ o.startTime?.slice(0, 16) }}
          </p>
          <p class="meta seats">
            <span class="meta-icon">●</span>
            座位：{{ (o.seatLabels || []).join(' / ') || '—' }}
          </p>

          <div class="info-bottom">
            <div class="price">
              <span class="amount">¥{{ o.totalAmount.toFixed(2) }}</span>
              <span v-if="Number(o.status) === 3 && o.refundAmount != null" class="refund">
                已退 ¥{{ o.refundAmount.toFixed(2) }}
              </span>
              <span v-if="payChannelLabel(o.payChannel)" class="channel">
                · {{ payChannelLabel(o.payChannel) }}
              </span>
            </div>
            <span class="order-no">#{{ o.number }}</span>
          </div>
          <p v-if="(Number(o.status) === 2 || Number(o.status) === 6) && !o.canReview && !o.reviewed" class="review-availability">
            {{ o.reviewReason || '放映结束后可评价' }}<span v-if="o.reviewAvailableAt"> · {{ o.reviewAvailableAt.slice(0, 16) }}</span>
          </p>
        </div>

        <div class="actions">
          <el-button v-if="Number(o.status) === 1" type="primary" :disabled="o.transactionState === 'PROCESSING'" @click="goPay(o)">去支付</el-button>
          <el-button
            v-if="Number(o.status) === 1"
            :loading="cancelling.has(o.id)"
            :disabled="o.transactionState === 'PROCESSING'"
            @click="cancelOrder(o)"
          >
            取消
          </el-button>
          <el-button v-if="o.reviewed || o.canReview" @click="goScore(o)">{{ o.reviewed ? '查看评价' : '写评价' }}</el-button>
          <el-button
            v-if="Number(o.status) === 2"
            type="danger"
            text
            :loading="refunding.has(o.id)"
            @click="refund(o)"
          >
            退款
          </el-button>
          <el-button text @click="goDetail(o)">详情</el-button>
        </div>
      </article>

      <el-pagination
        v-if="list.length > PAGE_SIZE"
        v-model:current-page="page"
        :page-size="PAGE_SIZE"
        :total="list.length"
        layout="prev, pager, next"
        class="pager"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.review-availability { color: var(--cx-text-muted); font-size: 11px; line-height: 1.7; margin: 10px 0 0; }
.orders {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-5);
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cx-space-3);
}

.title {
  margin: 0 0 4px;
  font-size: 26px;
  font-weight: 700;
  color: var(--cx-text-primary);
  letter-spacing: -0.02em;
}

.subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--cx-text-muted);
}

.head-meta {
  font-size: 12px;
  color: var(--cx-text-muted);
  padding: 4px 12px;
  border-radius: var(--cx-radius-full);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--cx-border);
}

.tabs {
  :deep(.el-tabs__item) {
    color: var(--cx-text-secondary);
    font-size: 14px;
    padding: 0 var(--cx-space-3);
    &.is-active { color: var(--cx-color-primary); font-weight: 600; }
  }
  :deep(.el-tabs__active-bar) {
    background: linear-gradient(90deg, var(--cx-color-primary), var(--cx-color-accent));
    height: 2px;
    border-radius: 2px;
  }
  :deep(.el-tabs__nav-wrap::after) { background-color: var(--cx-divider); }
}

.pager {
  justify-content: center;
  margin-top: var(--cx-space-4);
}

.list { display: flex; flex-direction: column; gap: var(--cx-space-3); }

.order-card {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  gap: var(--cx-space-5);
  padding: var(--cx-space-4);
  position: relative;
  overflow: hidden;
  border-left: 3px solid transparent;
  transition:
    background var(--cx-duration-fast) var(--cx-ease),
    border-color var(--cx-duration-fast) var(--cx-ease),
    transform var(--cx-duration-fast) var(--cx-ease);

  &.is-success { border-left-color: var(--cx-success); }
  &.is-warning { border-left-color: var(--cx-warning); }
  &.is-info { border-left-color: var(--cx-info); }
  &.is-mute { border-left-color: var(--cx-border-strong); }

  &:hover {
    transform: translateY(-2px);
    background: var(--cx-bg-card-hover);
  }

  .poster-wrap {
    position: relative;
    width: 96px;
    aspect-ratio: 2 / 3;
    border-radius: var(--cx-radius-md);
    overflow: hidden;
    background: linear-gradient(135deg, #1a1f2e 0%, #2a2235 100%);
    flex-shrink: 0;
  }

  .poster-shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 50%, rgba(10, 12, 18, 0.65) 100%);
    pointer-events: none;
  }
}

.info-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-space-3);
  margin-bottom: var(--cx-space-3);
}

.movie {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--cx-text-primary);
  letter-spacing: -0.01em;
  min-width: 0;
  flex: 1;

  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--cx-radius-full);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  flex-shrink: 0;

  &.is-success {
    background: color-mix(in srgb, var(--cx-success) 14%, transparent);
    color: var(--cx-success);
    border: 1px solid color-mix(in srgb, var(--cx-success) 32%, transparent);
  }
  &.is-warning {
    background: color-mix(in srgb, var(--cx-warning) 14%, transparent);
    color: var(--cx-warning);
    border: 1px solid color-mix(in srgb, var(--cx-warning) 32%, transparent);
  }
  &.is-info {
    background: rgba(59, 130, 246, 0.14);
    color: var(--cx-info);
    border: 1px solid rgba(59, 130, 246, 0.32);
  }
  &.is-danger {
    background: color-mix(in srgb, var(--cx-danger) 14%, transparent);
    color: var(--cx-danger);
    border: 1px solid color-mix(in srgb, var(--cx-danger) 32%, transparent);
  }
  &.is-mute {
    background: rgba(255, 255, 255, 0.05);
    color: var(--cx-text-muted);
    border: 1px solid var(--cx-border);
  }
}

.meta {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--cx-text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;

  .meta-icon {
    color: var(--cx-color-primary);
    font-size: 6px;
    line-height: 1;
  }
  .sep {
    opacity: 0.4;
    margin: 0 4px;
  }

  &.seats { color: var(--cx-text-primary); }
}

.info-bottom {
  margin-top: var(--cx-space-3);
  padding-top: var(--cx-space-3);
  border-top: 1px dashed var(--cx-divider);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-space-3);
}

.price {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.amount {
  color: var(--cx-color-primary);
  font-weight: 700;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.refund {
  font-size: 12px;
  color: var(--cx-text-muted);
}

.channel {
  font-size: 12px;
  color: var(--cx-text-muted);
}

.order-no {
  font-size: 11px;
  color: var(--cx-text-muted);
  font-family: var(--cx-font-mono);
  letter-spacing: 0.04em;
  opacity: 0.8;
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-end;
  gap: 4px;
  min-width: 96px;

  :deep(.el-button) {
    margin-left: 0;
    justify-content: flex-end;
  }
}

@media (max-width: 720px) {
  .order-card {
    grid-template-columns: 72px 1fr;
    .poster-wrap { width: 72px; }
    .actions {
      grid-column: 1 / -1;
      flex-direction: row;
      flex-wrap: wrap;
      min-width: 0;
      :deep(.el-button) { flex: 1; }
    }
  }
}
</style>
