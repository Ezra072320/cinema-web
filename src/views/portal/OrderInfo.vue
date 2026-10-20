<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { orderApi } from '@/api';
import type { OrderInfo as OrderInfoType } from '@/types';
import { useOrderActions } from '@/composables/useOrderActions';
import OrderTicket from './OrderTicket.vue';

/**
 * 订单详情页 —— 呈现(电子票根, 见 OrderTicket 组件) + 操作(load / 退款 / 取消).
 */
const route = useRoute();
const router = useRouter();

const orderId = computed(() => Number(route.params.orderId));
const order = ref<OrderInfoType | null>(null);
const loading = ref(true);
const error = ref<unknown>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    order.value = await orderApi.detail(orderId.value);
  } catch (err) {
    // toast 由 http 拦截器统一弹; 这里只记 error 渲染重试入口
    error.value = err;
  } finally {
    loading.value = false;
  }
}

// 退款/取消流程与「我的订单」共用 useOrderActions; 这里包一层作用于当前订单.
// 取消成功后跳回订单列表(与列表页"原地刷新"不同).
const { refunding, cancelling, refund: refundOrder, cancelOrder: cancelOrderApi } = useOrderActions({
  onRefunded: load,
  onCancelled: () => {
    void router.push({ name: 'me-orders', params: { status: 5 } });
  },
});
const isRefunding = computed(() => order.value != null && refunding.has(order.value.id));
const isCancelling = computed(() => order.value != null && cancelling.has(order.value.id));

function refund() {
  if (order.value) void refundOrder(order.value);
}

function cancelOrder() {
  if (order.value) void cancelOrderApi(order.value);
}

onMounted(load);
</script>

<template>
  <div class="ticket-page cx-page">
    <PageSkeleton v-if="loading" :rows="4" :show-header="true" />

    <ErrorState v-else-if="error" :error="error" @retry="load" />

    <template v-else-if="order">
      <!-- 顶行: 返回 + 订单号 -->
      <header class="topbar">
        <button class="back" type="button" @click="router.push({ name: 'me-orders', params: { status: 5 } })">
          <span class="chev">‹</span> 我的订单
        </button>
        <span class="serial">NO. {{ order.number }}</span>
      </header>

      <!-- 电子票根(含票面/撕票线/票根/图章样式)在 OrderTicket 组件 -->
      <OrderTicket :order="order" />


      <!-- 操作区 -->
      <p v-if="(Number(order.status) === 2 || Number(order.status) === 6) && !order.canReview && !order.reviewed" class="review-availability">
        {{ order.reviewReason || '电影放映结束后可评价' }}<span v-if="order.reviewAvailableAt"> · {{ order.reviewAvailableAt.slice(0, 16) }}</span>
      </p>
      <div class="actions">
        <el-button v-if="order.reviewed || order.canReview" type="primary" size="large" round
          @click="router.push({ name: 'score', params: { movieId: order.movieId, orderId: order.id } })">
          {{ order.reviewed ? '查看我的评价' : '写观影评价' }}
        </el-button>
        <el-button
          size="large"
          round
          class="btn-ghost"
          @click="router.push({ name: 'me-orders', params: { status: 5 } })"
        >
          返回我的订单
        </el-button>
        <el-button
          v-if="Number(order.status) === 1"
          type="primary"
          size="large"
          round
          class="btn-primary"
          @click="router.push({ name: 'pay', params: { orderId: order.id } })"
        >
          去支付 ¥{{ order.totalAmount.toFixed(2) }}
        </el-button>
        <el-button
          v-if="Number(order.status) === 1"
          size="large"
          round
          class="btn-ghost"
          :loading="isCancelling"
          @click="cancelOrder"
        >
          取消订单
        </el-button>
        <el-button
          v-if="Number(order.status) === 2"
          type="danger"
          size="large"
          round
          class="btn-danger"
          :loading="isRefunding"
          @click="refund"
        >
          申请退款
        </el-button>
      </div>
    </template>

    <EmptyState v-else title="订单不存在" hint="链接可能已失效" />
  </div>
</template>

<style scoped lang="scss">
.review-availability { text-align: center; color: var(--cx-text-muted); font-size: 12px; margin: 22px 0 0; line-height: 1.8; }
.ticket-page {
  padding-top: var(--cx-space-6);
  max-width: 860px;
  margin: 0 auto;
}

/* ===== 顶栏 ===== */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--cx-space-5);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px 8px 12px;
  border-radius: var(--cx-radius-full);
  border: 1px solid var(--cx-border);
  background: var(--cx-bg-glass);
  color: var(--cx-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--cx-duration-fast) var(--cx-ease);

  .chev { font-size: 18px; line-height: 1; }

  &:hover {
    color: var(--cx-color-primary);
    border-color: var(--cx-color-primary);
    background: color-mix(in srgb, var(--cx-color-primary) 10%, transparent);
  }
}

.serial {
  font-family: var(--cx-font-mono);
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--cx-text-muted);
}

/* ===== 操作区 ===== */
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--cx-space-3);
  margin-top: var(--cx-space-6);
  animation: ticket-in 0.5s var(--cx-ease-out) 0.15s both;
}

.btn-ghost {
  border-color: var(--cx-border-strong);
  color: var(--cx-text-secondary);
  background: var(--cx-bg-glass);

  &:hover {
    color: var(--cx-color-primary);
    border-color: var(--cx-color-primary);
  }
}

.btn-primary {
  box-shadow: var(--cx-glow-primary);
}

.btn-danger {
  border-color: rgba(220, 38, 38, 0.5);

  &:hover {
    border-color: var(--cx-danger);
    background: rgba(220, 38, 38, 0.12);
  }
}

/* ===== 响应式 ===== */
@media (max-width: 720px) {
  .actions {
    flex-wrap: wrap;

    .el-button {
      flex: 1;
      min-width: 140px;
    }
  }
}
</style>
