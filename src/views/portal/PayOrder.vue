<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { orderApi, userApi } from '@/api';
import { useAuth } from '@/composables/useAuth';
import { confirmAction } from '@/composables/useConfirm';
import { PAY_CHANNEL, type OrderInfo, type PayChannel } from '@/types';

const route = useRoute();
const router = useRouter();
const { bootstrap, profile } = useAuth();

const order = ref<OrderInfo | null>(null);
const loading = ref(true);
const paying = ref(false);
const cancelling = ref(false);
const channel = ref<PayChannel>('WECHAT');

const orderId = computed(() => Number(route.params.orderId));

/** 15 分钟支付时限——与后端 OrderService.PAY_TIMEOUT_MINUTES 同步, 详见 OrderServiceImpl. */
const TIMEOUT_MS = 15 * 60 * 1000;

/** 从订单 createTime 推算剩余毫秒; 到点后跳走, 不能再付. */
const remaining = ref(0);
let timer: number | undefined;

function startCountdown() {
  stopCountdown();
  if (!order.value?.createTime) return;
  const created = new Date(order.value.createTime).getTime();
  remaining.value = Math.max(0, created + TIMEOUT_MS - Date.now());
  timer = window.setInterval(() => {
    if (!order.value?.createTime) return;
    const created = new Date(order.value.createTime).getTime();
    remaining.value = Math.max(0, created + TIMEOUT_MS - Date.now());
    if (remaining.value <= 0) {
      stopCountdown();
      ElMessage.warning('订单已超时关闭，请重新下单');
      router.replace({ name: 'me-orders', params: { status: 5 } });
    }
  }, 1000);
}
function stopCountdown() {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}
function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

async function load() {
  loading.value = true;
  try {
    await bootstrap(true);
    const data = await orderApi.detail(orderId.value);
    // 2026-10-19 修复: 旧代码 `if (data.status === 1) 跳详情"已支付"` 是反守卫, 待支付单进支付页
    // 被立即踢走, 已支付单反而进倒计时 —— 整个 UI 支付链路实际是断的. 按真实状态分支处理.
    const s = Number(data.status);
    if (s === 2 || s === 6) {
      ElMessage.info('该订单已支付');
      router.replace({ name: 'order-info', params: { orderId: data.id } });
      return;
    }
    if (s === 3) {
      ElMessage.info('该订单已退款');
      router.replace({ name: 'me-orders', params: { status: 3 } });
      return;
    }
    if (s === 4) {
      ElMessage.warning('该订单已关闭，请重新选座下单');
      router.replace({ name: 'me-orders', params: { status: 5 } });
      return;
    }
    if (s !== 1) {
      // 未知状态(防御性): 回列表
      router.replace({ name: 'me-orders', params: { status: 5 } });
      return;
    }
    order.value = data;
    startCountdown();
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '订单加载失败');
  } finally {
    loading.value = false;
  }
}

async function pay() {
  if (!order.value) return;
  paying.value = true;
  try {
    const updated = await orderApi.pay(order.value.id, channel.value);
    stopCountdown();
    ElMessage.success(`已通过 ${PAY_CHANNEL[channel.value]} 支付`);
    router.replace({ name: 'order-info', params: { orderId: updated.id ?? order.value.id } });
  } catch {
    // 业务失败错误消息由 http 拦截器统一弹(避免 D8 双弹)
  } finally {
    paying.value = false;
  }
}

async function cancelOrder() {
  if (!order.value) return;
  const ok = await confirmAction(
    '确定取消该订单？取消后座位将释放，无法恢复。',
    '取消订单',
    { confirmButtonText: '确认取消', cancelButtonText: '再想想' },
  );
  if (!ok) return;
  cancelling.value = true;
  try {
    await userApi.cancelOrder(order.value.id);
    ElMessage.success('订单已取消，座位已释放');
    stopCountdown();
    router.replace({ name: 'me-orders', params: { status: 5 } });
  } catch {
    // 同 pay, 错误由拦截器弹
  } finally {
    cancelling.value = false;
  }
}

onMounted(load);
onBeforeUnmount(stopCountdown);
</script>

<template>
  <div class="pay-wrap">
    <PageSkeleton v-if="loading" :rows="3" :show-header="false" />

    <div v-else-if="order" class="pay">
      <header class="header">
        <h1 class="title">支付订单</h1>
        <p class="order-no">订单号：{{ order.number }}</p>
      </header>

      <div v-if="remaining > 0" class="countdown-bar">订单将在 <strong>{{ formatTime(remaining) }}</strong> 后自动关闭，请尽快完成支付</div>

      <el-card class="movie-card cx-glass">
        <div class="row">
          <div class="poster">
            <PosterImage :src="order.poster" :alt="order.movieName || '影片海报'" :initial="order.movieName?.charAt(0)" />
          </div>
          <div class="info">
            <h3 class="movie">{{ order.movieName }}</h3>
            <p class="meta">{{ order.hallName }} · {{ order.startTime?.slice(0, 16) }} 开映</p>
            <p class="seats">座位：{{ (order.seatLabels || []).join(' / ') || '—' }}</p>
          </div>
          <div class="amount">
            <div class="label">应付金额</div>
            <div class="num">¥{{ order.totalAmount.toFixed(2) }}</div>
          </div>
        </div>
      </el-card>

      <el-card class="channel-card cx-glass">
        <h4 class="sub-title">支付方式</h4>
        <el-radio-group v-model="channel" class="channel-group">
          <el-radio-button v-for="(label, key) in PAY_CHANNEL" :key="key" :value="key">{{ label }}</el-radio-button>
        </el-radio-group>
        <p class="channel-hint">本系统为演示环境，支付为模拟接口：选择支付方式并点击「立即支付」即视为完成支付</p>
      </el-card>

      <div class="actions">
        <el-button round size="large" :disabled="!profile || paying || cancelling" @click="cancelOrder">取消订单</el-button>
        <el-button type="primary" round size="large" :disabled="!profile || paying || cancelling || remaining <= 0" :loading="paying" @click="pay">
          立即支付 ¥{{ order.totalAmount.toFixed(2) }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pay-wrap { padding: var(--cx-space-6) 0; }
.pay { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--cx-space-4); }
.header { display: flex; align-items: baseline; gap: var(--cx-space-3); flex-wrap: wrap; }
.title { font-size: 22px; font-weight: 700; margin: 0; }
.order-no { color: var(--cx-text-muted); font-size: 13px; margin: 0; }

.countdown-bar {
  background: linear-gradient(90deg, rgba(220,38,38,0.12), rgba(220,38,38,0.04));
  border: 1px solid rgba(220,38,38,0.3);
  color: #fca5a5;
  padding: 10px 16px;
  border-radius: var(--cx-radius-md);
  font-size: 14px;
  strong { font-size: 18px; font-variant-numeric: tabular-nums; margin: 0 4px; }
}

.movie-card .row { display: flex; gap: var(--cx-space-4); align-items: flex-start; }
.poster { width: 80px; height: 120px; border-radius: var(--cx-radius-md); overflow: hidden; flex-shrink: 0; }
.movie-card .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.movie { font-size: 18px; font-weight: 700; margin: 0; }
.meta, .seats { color: var(--cx-text-secondary); font-size: 13px; margin: 0; }
.movie-card .amount { text-align: right; }
.movie-card .label { color: var(--cx-text-muted); font-size: 12px; }
.movie-card .num { color: var(--cx-color-primary); font-size: 26px; font-weight: 700; }

.sub-title { margin: 0 0 var(--cx-space-3); font-size: 15px; font-weight: 600; }
.channel-group { display: flex; gap: var(--cx-space-2); flex-wrap: wrap; }
.channel-hint { color: var(--cx-text-muted); font-size: 12px; margin: var(--cx-space-3) 0 0; }

.actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--cx-space-3); }

@media (max-width: 560px) {
  .movie-card .row { flex-wrap: wrap; }
  .movie-card .amount { width: 100%; text-align: left; }
}
</style>
