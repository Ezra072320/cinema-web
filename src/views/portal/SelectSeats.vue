<script setup lang="ts">
/**
 * 选座页.
 *
 * 数据来自 `GET /api/schedule/{id}/seats`, 一次拿全:
 *  - 场次信息(影厅/影片/时间/票价)
 *  - 座位图 —— 取自**本场次锁定的座位图版本**, 不是影厅当前版本.
 *    所以管理员改完影厅座位图, 老场次这里画出来的仍是当初卖票那张图.
 *  - 每座的票状态(0 已售/锁定, 1 可售, 2 已退)
 *
 * 重要: 下单传的是 `ticketId` 不是 `seatId`. 座位是物理位置, 票是"这个场次下
 * 这个位置的可售单元", 两者 id 不同 —— 之前这里传的是 seat.id, 是错的.
 *
 * 过道/不可用座位(status=0, 没有票)也会返回, 用来对齐网格, 渲染成不可点的空白.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { scheduleApi, userApi } from '@/api';
import { benefitApi, type Coupon } from '@/api/benefit';
import { useAuth } from '@/composables/useAuth';
import SeatLegend from '@/components/SeatLegend.vue';
import { useSeatGrid } from '@/composables/useSeatGrid';
import { seatTypeLabel, seatVisualType, type ScheduleSeatItem, type ScheduleSeats } from '@/types';

const route = useRoute();
const router = useRouter();
const { bootstrap, profile, isLogin } = useAuth();

const scheduleId = computed(() => Number(route.params.scheduleId));

const data = ref<ScheduleSeats | null>(null);
/** 选中的票 id(不是座位 id). */
const selected = ref<Set<number>>(new Set());
const loading = ref(true);
const submitting = ref(false);
const checkoutKey = ref(crypto.randomUUID());
const coupons = ref<Coupon[]>([]);
const couponId = ref<number | undefined>();
const couponsUnavailable = ref(false);
const availableCoupons = computed(() =>
  coupons.value.filter((c) => c.status === 'AVAILABLE' && Number(c.minimum) <= totalAmount.value),
);
const discount = computed(() =>
  Number(availableCoupons.value.find((c) => c.id === couponId.value)?.discount ?? 0),
);
const payable = computed(() => Math.max(0, totalAmount.value - discount.value));
watch(availableCoupons, (list) => {
  if (!list.some((c) => c.id === couponId.value)) couponId.value = undefined;
});
watch(couponId, () => {
  checkoutKey.value = crypto.randomUUID();
});
async function loadCoupons() {
  if (!isLogin.value) return;
  try {
    coupons.value = await benefitApi.coupons();
    couponsUnavailable.value = false;
  } catch {
    coupons.value = [];
    couponsUnavailable.value = true;
  }
}
onMounted(loadCoupons);
watch(isLogin, loadCoupons);
watch(
  () => `${scheduleId.value}:${[...selected.value].sort((a, b) => a - b).join(',')}`,
  () => {
    checkoutKey.value = crypto.randomUUID();
  },
);

/**
 * 情侣对几何(哪格被合并 / 跨几列 / 每格落在哪)由 useSeatGrid 提供,
 * 跟影厅预览页共用同一份实现 —— 之前这里是手抄的一份, 预览页完全没做合并.
 */
const {
  seatById,
  pairPartner,
  isCouple: isCoupleSeatId,
  isRightHalf,
  isLeftHalf,
  spanOf,
  rowNos,
  seatNumber,
} = useSeatGrid<ScheduleSeatItem>(
  computed(() => data.value?.seats),
  computed(() => data.value?.coupleGroups),
);

/** 一对里两个座位是不是都可以选(都还没卖). */
function pairSelectable(seatId: number): boolean {
  const partnerId = pairPartner.value.get(seatId);
  if (partnerId == null) return true;
  const a = seatById(seatId);
  const b = seatById(partnerId);
  if (!a || !b) return false;
  return !isBlank(a) && !isBlank(b) && !isSold(a) && !isSold(b);
}

/** 过道/不可用: 座位本身不可用, 或者这个场次没给它建票. */
function isBlank(s: ScheduleSeatItem | undefined): boolean {
  return !s || s.status !== 1 || s.ticketId == null;
}

/**
 * 可渲染的座位(该场次给它建了票、物理可用).
 * 2026-10-19 修复: 管理员画布里**没选为空座的格子不再渲染** —— 早先每个格子都渲染成
 * 透明 aisle div, 选座页出现一大片空画布. 但网格**仍按原始画布尺寸(如 12×10)铺满**,
 * 座位用原始坐标定位不平移 —— 画在画布中央的座位仍然显示在中央, 相对银幕的位置固定.
 */
const visibleSeats = computed(() => (data.value?.seats ?? []).filter((s) => !isBlank(s)));

/** 有座位的排(升序). 整排都是空座的行只留行高(不显示排号). */
const visibleRows = computed(() => {
  const ys = new Set<number>();
  for (const s of visibleSeats.value) ys.add(s.y);
  return [...ys].sort((a, b) => a - b);
});

/**
 * 画布尺寸 —— **用后端下发的全画布 rows/cols**(含空座占位), 不是可见座位的包围盒:
 * 网格列宽/行高按整个画布均分, 座位落在它在画布上的原始格子里, 相对银幕位置不变.
 */
const gridCols = computed(() => Math.max(1, data.value?.cols ?? 0));
const gridRows = computed(() => Math.max(1, data.value?.rows ?? 0));

/** 本行的可渲染座位(情侣对右半格除外), 按 x 升序 —— 显式定位, 顺序只影响 Tab 焦点. */
function seatsOfRow(y: number): ScheduleSeatItem[] {
  return visibleSeats.value
    .filter((s) => s.y === y && !isRightHalf(s.seatId))
    .sort((a, b) => a.x - b.x);
}

/**
 * 座位格的网格位置 —— **原始画布坐标**(第 1 列是排号, 座位 x 落在 x+1 列).
 * 不做包围盒平移: 位置相对银幕固定是核心需求.
 */
function cellStyleLocal(s: ScheduleSeatItem): Record<string, string | number> {
  return isLeftHalf(s.seatId) && spanOf(s.seatId) > 1
    ? { gridColumn: `${s.x + 1} / span ${spanOf(s.seatId)}`, gridRow: s.y }
    : { gridColumn: s.x + 1, gridRow: s.y };
}

/** 排号那一格的网格位置(第 1 列), 行号就是画布行号 —— 与座位同坐标系. */
function rowLabelStyleLocal(y: number): Record<string, number> {
  return { gridColumn: 1, gridRow: y };
}

/** 已售/锁定/作废都不可选. 票状态 1=可售, 0=已售/锁定, 2=已退/作废(场次取消时全场置 2). */
function isSold(s: ScheduleSeatItem | undefined): boolean {
  return !!s && s.ticketStatus !== 1;
}

/** 场次已取消: 整页停止售票. */
const canceled = computed(() => Number(data.value?.status) === 2);

function isSelected(s: ScheduleSeatItem | undefined): boolean {
  if (!s) return false;
  // 情侣座整对进出, 所以用 pairSelected 判断: 一对要么都算选中, 要么都不算
  return pairSelected(s.seatId);
}

/**
 * 这一格的全部样式类 —— **唯一的类型判断入口**.
 *
 * 类型部分(standard/couple/vip/accessible)由共享的 {@link seatVisualType} 决定,
 * 跟座位图编辑器、影厅预览页完全一致. 2026-10-19 起: 空座/过道格子整个不渲染
 * (见 {@link visibleSeats}), 这里只处理真座位的类型与状态.
 */
function seatClassOf(s: ScheduleSeatItem) {
  return {
    [seatVisualType({ status: s.status, type: s.type }, isCoupleSeatId(s.seatId))]: true,
    sold: isSold(s),
    selected: isSelected(s),
  };
}

/**
 * 座位在格子里的显示名, 如 `1-1` = 第 1 排第 1 号.
 *
 * 用**座位号**而不是物理坐标 —— 跟影厅预览页一致: 过道不占号, 一对情侣座只占一个号.
 * 两页显示同一个座位却给出不同的号, 观众拿着票找座会找错.
 */
function seatName(s: ScheduleSeatItem): string {
  return seatNumber(s.y, s.seatId);
}

/** 一次最多 6 张票. */
const MAX_TICKETS = 6;

/**
 * 选中/取消一个座位.
 *
 * 情侣座要**整对进出**: 后端强制校验一对必须一起买, 只选一个下单会被拒.
 * 与其让用户走到下单才报错, 不如点一下就自动带上另一半.
 */
function toggleSeat(s: ScheduleSeatItem | undefined) {
  if (!s || isBlank(s) || isSold(s) || s.ticketId == null) return;

  // 情侣对: 两个座位的 ticketId 一起处理
  const partnerSeatId = pairPartner.value.get(s.seatId);
  const partner = partnerSeatId != null ? seatById(partnerSeatId) : undefined;

  const next = new Set(selected.value);
  const wasSelected = next.has(s.ticketId);

  if (partner?.ticketId != null) {
    // 只要有一半卖掉了, 整对都不能选
    if (!wasSelected && !pairSelectable(s.seatId)) {
      ElMessage.warning('这对情侣座有一位已售出, 换一对吧');
      return;
    }
    if (!wasSelected && next.size + 2 > MAX_TICKETS) {
      ElMessage.warning(`一次最多选 ${MAX_TICKETS} 张票`);
      return;
    }
    if (wasSelected) {
      next.delete(s.ticketId);
      next.delete(partner.ticketId);
    } else {
      next.add(s.ticketId);
      next.add(partner.ticketId);
    }
  } else {
    if (wasSelected) {
      next.delete(s.ticketId);
    } else {
      if (next.size >= MAX_TICKETS) {
        ElMessage.warning(`一次最多选 ${MAX_TICKETS} 张票`);
        return;
      }
      next.add(s.ticketId);
    }
  }
  selected.value = next;
}

/** 整对的选中与否: 一对要么都选中要么都没选中. */
function pairSelected(seatId: number): boolean {
  const partnerId = pairPartner.value.get(seatId);
  if (partnerId == null) {
    const s = seatById(seatId);
    return s?.ticketId != null && selected.value.has(s.ticketId);
  }
  const a = seatById(seatId);
  const b = seatById(partnerId);
  return (
    !!a?.ticketId &&
    !!b?.ticketId &&
    selected.value.has(a.ticketId) &&
    selected.value.has(b.ticketId)
  );
}

const selectedSeats = computed(() =>
  (data.value?.seats ?? []).filter((s) => s.ticketId != null && selected.value.has(s.ticketId)),
);

/**
 * 单价倍率: 情侣 / VIP / 其他.
 *
 * 倍率从**后端**拿, 不写死 —— 倍率属于场次, 管理员可以给午场和午夜场定不同的价.
 * 前端自己写 2.5/3 的话, 调过价的场次会显示一个总价、下单扣另一个.
 */
function multiplier(t: number): number {
  const d = data.value;
  if (!d) return 1;
  if (t === 2) return d.couplePriceMultiplier ?? 1;
  if (t === 3) return d.vipPriceMultiplier ?? 1;
  return 1;
}

const totalAmount = computed(() => {
  const base = data.value?.price ?? 0;
  return selectedSeats.value.reduce((sum, s) => sum + base * multiplier(s.type), 0);
});

/**
 * 竞态保护: /seats/A → /seats/B 是同一个组件实例, 只换路由参数.
 * 没有 watch 时根本不重新加载(旧场次的座位图原地残留);
 * 有 watch 没 seq 时慢的旧响应会盖掉新场次的数据.
 */
let loadSeq = 0;
async function load() {
  const my = ++loadSeq;
  loading.value = true;
  try {
    const r = await scheduleApi.seats(scheduleId.value);
    if (my !== loadSeq) return;
    data.value = r;
  } catch {
    // 业务失败错误由 http 拦截器统一弹 toast, 页面不重弹(D8)
    if (my === loadSeq) data.value = null;
  } finally {
    if (my === loadSeq) loading.value = false;
  }
}

watch(scheduleId, () => {
  selected.value = new Set();
  load();
});

async function submit() {
  if (submitting.value) return;
  if (!isLogin.value) {
    ElMessage.warning('请先登录');
    router.replace({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  await bootstrap(true);
  if (!profile.value?.id) {
    ElMessage.error('用户信息未就绪,请稍后再试');
    return;
  }
  if (selected.value.size === 0) {
    ElMessage.warning('请先选座');
    return;
  }

  const confirmed = await ElMessageBox.confirm(
    `已选 ${selected.value.size} 个座位,实付 ¥${payable.value.toFixed(2)}${discount.value ? `（已优惠 ¥${discount.value.toFixed(2)}）` : ''}. 确认下单?`,
    '确认订单',
    { type: 'info', confirmButtonText: '确认下单' },
  ).catch(() => false);
  if (!confirmed) return;

  submitting.value = true;
  try {
    const orderId = await userApi.createOrder(
      {
        scheduleId: scheduleId.value,
        // 传票 id, 不是座位 id
        ticketIds: [...selected.value],
        ...(couponId.value ? { couponId: couponId.value } : {}),
        // 不传 userId —— 后端从 token 取, 传了反而 400
      },
      checkoutKey.value,
    );
    ElMessage.success('订单创建成功');
    router.replace({ name: 'pay', params: { orderId } });
  } catch (error) {
    const failure = error as { response?: { status: number }; code?: string | number };
    const status = failure.response?.status;
    // 保留网络失败时的选择和操作编号，重试可恢复已提交的订单。
    if (typeof failure.code !== 'number' && (!status || status === 429 || status >= 500)) return;
    // 拦截器已统一弹 ORDER_LOCK_FAILED 错误, 页面只刷新票态
    await load();
    selected.value = new Set();
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="seats-wrap">
    <PageSkeleton v-if="loading" :rows="6" :show-header="true" />

    <EmptyState v-else-if="canceled" title="场次已取消" hint="该场次已停止售票，请选择其他场次" />

    <div v-else-if="data" class="seats">
      <header class="header">
        <h1 class="title">{{ data.movieName }}</h1>
        <p class="meta">
          {{ data.hallName }} · {{ data.startTime?.slice(0, 16) }} · ¥{{ data.price }}
        </p>
      </header>

      <div class="screen-wrap">
        <div class="screen" aria-hidden="true" />
        <span class="screen-label">银幕</span>
      </div>

      <div
        v-if="visibleRows.length > 0"
        class="seat-grid"
        :style="{
          gridTemplateColumns: `32px repeat(${gridCols}, minmax(36px, 56px))`,
          gridTemplateRows: `repeat(${gridRows}, 36px)`,
        }"
      >
        <!--
          2026-10-19 重写: 只渲染**真座位**, 不再把空座/过道画成透明格 —— 但网格仍按
          **原始画布(如 12×10)的行列数铺满**, 座位用画布原始坐标(grid-row=y, grid-col=x+1)
          定位不平移: 空行/空列照样占行高列宽, 座位相对银幕的位置与管理员画图时一致.
          gridTemplateRows 固定行高是关键 —— 否则整排空座的行会塌成 0 高, 把下面的排挤上来.
          情侣对右半格不渲染(左半格已 span 横跨).
        -->
        <template v-for="y in visibleRows" :key="y">
          <!-- 排号用重编后的(过道不占号), 行位置仍是画布行号 -->
          <div class="row-label" :style="rowLabelStyleLocal(y)">{{ rowNos.get(y) ?? y }}</div>
          <div
            v-for="s in seatsOfRow(y)"
            :key="s.seatId"
            class="seat"
            :class="seatClassOf(s)"
            :style="cellStyleLocal(s)"
            role="button"
            :tabindex="isBlank(s) ? -1 : 0"
            :aria-disabled="isSold(s) || undefined"
            :aria-pressed="isSelected(s)"
            :aria-label="`${isCoupleSeatId(s.seatId) ? `第${rowNos.get(y) ?? y}排情侣座` : `第${rowNos.get(y) ?? y}排${seatNumber(s.y, s.seatId).split('-')[1]}座`}${isSold(s) ? '，已售' : isSelected(s) ? '，已选' : ''}`"
            :title="seatTypeLabel(s.type)"
            @click="toggleSeat(s)"
            @keydown.enter="toggleSeat(s)"
            @keydown.space.prevent="toggleSeat(s)"
          >
            {{ seatName(s) }}
          </div>
        </template>
      </div>

      <EmptyState v-else title="该场次暂无座位图" hint="请选择其他场次" />

      <!-- 四类座位 + 过道由共用组件出, 颜色跟编辑器/预览页一致;
           「已选/已售」是这一页特有的状态, 走 extra 插槽 -->
      <SeatLegend class="legend">
        <template #extra>
          <span class="lg"><i class="chip chip--selected" />已选</span>
          <span class="lg"><i class="chip chip--sold" />已售</span>
        </template>
      </SeatLegend>

      <div v-if="isLogin" class="coupon-choice">
        <label for="checkout-coupon">优惠券</label>
        <el-select
          id="checkout-coupon"
          v-model="couponId"
          clearable
          placeholder="不使用优惠券"
          style="width: min(100%, 300px)"
        >
          <el-option
            v-for="c in availableCoupons"
            :key="c.id"
            :value="c.id"
            :label="`${c.name} · 满${c.minimum}减${c.discount}`"
          />
        </el-select>
        <RouterLink to="/me/coupons">去领券</RouterLink>
        <small v-if="couponsUnavailable">优惠券服务暂不可用，可直接下单</small>
      </div>
      <div class="summary cx-glass">
        <div class="info">
          <div class="label">已选座位</div>
          <div class="value">
            <span v-if="!selectedSeats.length" class="muted">请从上方选择</span>
            <el-tag
              v-for="s in selectedSeats"
              :key="s.ticketId ?? s.seatId"
              :type="s.type === 2 ? 'warning' : s.type === 3 ? 'danger' : 'primary'"
              effect="dark"
              style="margin-right: 6px"
            >
              <!-- 座号与格子上显示的一致(seatNumber 重编号), 不再是物理坐标 -->
              {{ seatName(s) }}
            </el-tag>
          </div>
        </div>
        <div class="amount">
          <span class="label"
            >实付 <small v-if="discount">已优惠 ¥{{ discount.toFixed(2) }}</small></span
          >
          <span class="num">¥{{ payable.toFixed(2) }}</span>
        </div>
        <el-button
          type="primary"
          size="large"
          :loading="submitting"
          :disabled="selectedSeats.length === 0"
          @click="submit"
        >
          立即下单
        </el-button>
      </div>
    </div>

    <EmptyState v-else title="场次不存在" hint="请重新选择场次" />
  </div>
</template>

<style scoped lang="scss">
.coupon-choice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0;
  font-size: 13px;
}
.coupon-choice a {
  color: #e4bc75;
}
.coupon-choice small {
  color: #939baa;
}
.seats-wrap {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--cx-space-4) 0;
}

.seats {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-5);
}

.header {
  .title {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .meta {
    color: var(--cx-text-secondary);
    font-size: 13px;
    margin: 6px 0 0;
  }
}

.screen-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: var(--cx-space-4) 0;
}
/* 8px 高的渐变条装不下「银幕」二字, 文字改作下方标注 */
.screen-label {
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--cx-text-muted);
}
.screen {
  width: 60%;
  height: 8px;
  background: linear-gradient(180deg, var(--cx-color-primary), transparent);
  border-radius: 50%;
  filter: blur(0.5px);
}

.seat-grid {
  display: grid;
  gap: 6px;
  padding: var(--cx-space-5);
  background: var(--cx-bg-card);
  border-radius: var(--cx-radius-lg);
  border: 1px solid var(--cx-border);
  overflow-x: auto;
  /* 座位列宽有上限, 大屏下不会被 1fr 拉成扁平方块; 整体居中.
     safe center: 窄屏溢出时从左侧开始, 保证左侧座位可滚动到. */
  justify-content: safe center;
}

.row-label {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cx-text-muted);
  font-size: 12px;
}

.seat {
  height: 36px;
  border-radius: var(--cx-radius-sm);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--cx-border);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 格子里显示「行-列」(如 12-16), 字要小一号才装得下 */
  font-size: 11px;
  color: var(--cx-text-secondary);
  cursor: pointer;
  transition:
    background var(--cx-duration-fast) var(--cx-ease),
    border-color var(--cx-duration-fast) var(--cx-ease),
    color var(--cx-duration-fast) var(--cx-ease),
    transform var(--cx-duration-fast) var(--cx-ease);
  outline: none;
  white-space: nowrap;

  &:hover {
    border-color: var(--cx-color-primary);
    color: var(--cx-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--cx-color-primary);
    outline-offset: 2px;
  }

  /* 过道 / 该场次没建票的不可用位: 占位但不参与交互.
     类名跟编辑器、预览页统一叫 aisle(这里以前叫 blank) */
  &.aisle {
    background: transparent;
    border-color: transparent;
    cursor: default;
    pointer-events: none;
  }

  /* 座位类型配色统一走 theme.scss 的 --cx-seat-* 令牌, 跟编辑器/预览页共用.
     注意这几条要写在 .aisle 之后: 同优先级下后写的生效, 否则过道格会被类型背景盖住. */
  &.standard {
    background: var(--cx-seat-standard-bg);
    border-color: var(--cx-seat-standard-border);
    color: var(--cx-seat-standard-text);
  }

  /* 情侣座: 左半格靠 grid-column: span 2 横跨两列, 右半格整个不渲染.
     两个座位在后端仍是独立的票, 只是显示上合成一个单元.
     合并后整格是独立矩形, 四角都要圆 —— 早先只圆左边是旧双格拼接写法的遗留. */
  &.couple {
    background: var(--cx-seat-couple-bg);
    border-color: var(--cx-seat-couple-border);
    color: var(--cx-seat-couple-text);
    border-radius: var(--cx-radius-sm);
  }

  &.vip {
    background: var(--cx-seat-vip-bg);
    border-color: var(--cx-seat-vip-border);
    color: var(--cx-seat-vip-text);
  }

  /* 早先整个漏掉的一类 */
  &.accessible {
    background: var(--cx-seat-accessible-bg);
    border-color: var(--cx-seat-accessible-border);
    color: var(--cx-seat-accessible-text);
  }

  /* 选中/已售是**状态**叠加在类型之上, 所以放在最后, 覆盖上面的类型配色 */
  &.selected {
    background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
    color: white;
    border-color: transparent;
    box-shadow: var(--cx-glow-primary);
  }

  &.sold {
    background: rgba(255, 255, 255, 0.02);
    color: var(--cx-text-muted);
    border-color: transparent;
    cursor: not-allowed;

    &:hover {
      border-color: transparent;
      color: var(--cx-text-muted);
    }
  }
}

/* 图例主体在 components/SeatLegend.vue; 这里只补这一页特有的两个状态色块 */
.legend {
  margin-top: var(--cx-space-4);

  :deep(.chip--selected) {
    background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
    border-color: transparent;
  }
  :deep(.chip--sold) {
    background: rgba(255, 255, 255, 0.02);
    border-color: transparent;
  }
}

.summary {
  position: sticky;
  bottom: 16px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--cx-space-5);
  align-items: center;
  padding: var(--cx-space-4) var(--cx-space-5);
  border-radius: var(--cx-radius-lg);

  .info .label,
  .amount .label {
    font-size: 12px;
    color: var(--cx-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
  }

  .info .muted {
    color: var(--cx-text-muted);
    font-size: 13px;
  }

  .amount .num {
    color: var(--cx-color-primary);
    font-size: 24px;
    font-weight: 700;
  }
}

@media (max-width: 640px) {
  .summary {
    grid-template-columns: 1fr;
    text-align: center;
  }
}
</style>
