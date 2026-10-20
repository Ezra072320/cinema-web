<script setup lang="ts">
import { computed } from 'vue';
import { ORDER_STATUS_NUM, type OrderInfo } from '@/types';

/**
 * 电子票根 —— 整单画成一张实体电影票根(2026-10-19 重设计).
 *
 * 三段式: 顶部票面(海报 + 片名 + 场次大字) / 打孔撕票线(齿孔 + 虚线) /
 * 下截票根(票号 / 金额 / 条形码), 状态是一枚斜盖的橡皮图章.
 *
 * 时间一律字符串切片取(yyyy-MM-dd HH:mm:ss), 不 new Date 解析 —— 时区坑见 README.
 * 纯展示组件: 退款/取消等操作留在 OrderInfo 页面.
 */
const props = defineProps<{ order: OrderInfo }>();

/** 状态图章: 文案 + 色调类名(映射到 .stamp--xxx). */
const statusInfo = computed(() => {
  const s = Number(props.order.status);
  const label = ORDER_STATUS_NUM[s] ?? '未知';
  const tone =
    s === 2 || s === 6 ? 'paid' : s === 1 ? 'unpaid' : s === 3 ? 'refunded' : s === 4 ? 'closed' : 'closed';
  return { label, tone };
});

/** 场次时间拆两段展示: 年月日 + 时分. */
const startDay = computed(() => props.order.startTime?.slice(0, 10) ?? '');
const startClock = computed(() => props.order.startTime?.slice(11, 16) ?? '');

/** 下单时间同口径切片. */
const createText = computed(() => props.order.createTime?.slice(0, 16) ?? '—');

const isRefunded = computed(() => Number(props.order.status) === 3 && props.order.refundAmount != null);

/** 实付/已退金额. */
const amountText = computed(() => {
  return (isRefunded.value ? props.order.refundAmount! : props.order.totalAmount).toFixed(2);
});

/**
 * 条形码装饰 —— 由订单号推导的确定性条宽序列, 纯视觉元素.
 * (真条形码要配扫码规则, 票根这里是印刷纹理.)
 */
const barcodeBars = computed<number[]>(() => {
  const n = props.order.number ?? '';
  return [...n].map((c) => (c.charCodeAt(0) % 4) + 1);
});
</script>

<template>
      <!-- ===== 票根本体 ===== -->
      <article class="ticket">
        <!-- 票头: 院线标识 -->
        <div class="ticket-head">
          <span class="kicker">ADMIT ONE</span>
          <span class="brand">猫头鹰影院 · 观影凭证</span>
          <span class="kicker">ADMIT ONE</span>
        </div>

        <!-- 票面 -->
        <div class="face">
          <img v-if="order.poster" :src="order.poster" :alt="order.movieName" class="poster" />
          <div v-else class="poster poster--ph">{{ order.movieName?.charAt(0) }}</div>

          <div class="face-main">
            <p class="movie-kicker">NOW SHOWING</p>
            <h1 class="movie-title">{{ order.movieName }}</h1>

            <!-- 场次大字: 票面的视觉主角 -->
            <div class="showtime">
              <div class="show-date">
                <span class="d-label">DATE</span>
                <span class="d-value">{{ startDay }}</span>
              </div>
              <div class="show-clock">
                <span class="c-label">TIME</span>
                <span class="c-value">{{ startClock }}</span>
              </div>
              <div class="show-hall">
                <span class="h-label">HALL</span>
                <span class="h-value">{{ order.hallName }}</span>
              </div>
            </div>

            <!-- 座位: 票面打孔式印章 -->
            <div class="seats">
              <span class="s-label">SEATS</span>
              <div class="s-list">
                <span v-for="s in order.seatLabels || []" :key="s" class="seat-stamp">{{ s }}</span>
                <span v-if="!(order.seatLabels || []).length" class="seat-stamp seat-stamp--none">—</span>
              </div>
            </div>
          </div>

          <!-- 状态图章: 斜盖在票面上 -->
          <div v-if="statusInfo" class="stamp" :class="`stamp--${statusInfo.tone}`">
            {{ statusInfo.label }}
          </div>
        </div>

        <!-- ===== 撕票线 ===== -->
        <div class="perf">
          <span class="notch notch--left" aria-hidden="true" />
          <span class="notch notch--right" aria-hidden="true" />
          <span class="perf-line" aria-hidden="true" />
        </div>

        <!-- ===== 票根 ===== -->
        <div class="stub">
          <div class="stub-grid" :class="{ 'stub-grid--single': !isRefunded }">
            <div class="cell">
              <span class="c-label">ORDER NO.</span>
              <span class="c-mono">{{ order.number }}</span>
            </div>
            <div class="cell">
              <span class="c-label">ISSUED AT</span>
              <span class="c-mono">{{ createText }}</span>
            </div>
            <div class="cell cell--amount">
              <span class="c-label">{{ isRefunded ? 'REFUNDED' : 'TOTAL' }}</span>
              <span class="c-amount">
                <span v-if="isRefunded" class="old-price">¥{{ order.totalAmount.toFixed(2) }}</span>
                ¥{{ amountText }}
              </span>
            </div>
            <div v-if="isRefunded" class="cell">
              <span class="c-label">REFUND AT</span>
              <span class="c-mono">{{ (order.refundTime || '').slice(0, 16) || '—' }}</span>
            </div>
          </div>

          <!-- 条形码 + 微文案 -->
          <div class="stub-foot">
            <div class="barcode" aria-hidden="true">
              <i v-for="(w, i) in barcodeBars" :key="i" :style="{ width: `${w}px` }" />
            </div>
            <p class="fineprint">此券仅限本人使用 · 请勿转发 · 猫头鹰影院 CINEMA</p>
          </div>
        </div>
      </article>

</template>

<style scoped lang="scss">
/* ================================
   电子票根 · Design Notes
   - 票面(上) / 打孔撕票线 / 票根(下) 三段式
   - 图章 = 斜盖橡皮章, 双线描边
   - 等宽字体(JetBrains Mono)承载票号/金额, 大写字距拉开的微标签做"印刷感"
   - 金色发丝线 + 暖色渐晕做票纸质感
   ================================ */

/* ===== 票根本体 ===== */
.ticket {
  position: relative;
  border-radius: var(--cx-radius-lg);
  background:
    radial-gradient(120% 90% at 82% 8%, color-mix(in srgb, var(--cx-color-primary) 12%, transparent) 0%, transparent 52%),
    radial-gradient(130% 100% at 8% 100%, color-mix(in srgb, var(--cx-color-accent) 14%, transparent) 0%, transparent 55%),
    linear-gradient(168deg, #201c22 0%, #171822 55%, #1a1420 100%);
  border: 1px solid color-mix(in srgb, var(--cx-color-primary) 22%, transparent);
  box-shadow:
    var(--cx-shadow-lg),
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 80px color-mix(in srgb, var(--cx-color-primary) 7%, transparent);
  overflow: hidden;
  animation: ticket-in 0.55s var(--cx-ease-out) both;
}

@keyframes ticket-in {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}

/* 票头 */
.ticket-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-space-3);
  padding: 12px 28px;
  border-bottom: 1px solid color-mix(in srgb, var(--cx-color-primary) 28%, transparent);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--cx-color-primary) 10%, transparent), transparent);

  .brand {
    font-size: 12px;
    letter-spacing: 0.34em;
    text-indent: 0.34em;
    color: var(--cx-color-primary);
    font-weight: 600;
    white-space: nowrap;
  }

  .kicker {
    font-family: var(--cx-font-mono);
    font-size: 10px;
    letter-spacing: 0.28em;
    color: color-mix(in srgb, var(--cx-color-primary) 50%, transparent);
    white-space: nowrap;
  }
}

/* ===== 票面 ===== */
.face {
  position: relative;
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--cx-space-6);
  padding: var(--cx-space-8) var(--cx-space-8) var(--cx-space-6);
}

.poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--cx-radius-md);
  border: 1px solid color-mix(in srgb, var(--cx-color-primary) 30%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  background: rgba(255, 255, 255, 0.04);

  &--ph {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 56px;
    font-weight: 800;
    color: color-mix(in srgb, var(--cx-color-primary) 35%, transparent);
    background:
      radial-gradient(80% 60% at 30% 25%, color-mix(in srgb, var(--cx-color-primary) 16%, transparent), transparent 70%),
      rgba(255, 255, 255, 0.03);
  }
}

.face-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
}

.movie-kicker {
  margin: 0;
  font-family: var(--cx-font-mono);
  font-size: 11px;
  letter-spacing: 0.32em;
  color: var(--cx-color-accent);
  opacity: 0.9;
}

.movie-title {
  margin: -4px 0 0;
  font-size: clamp(26px, 3.6vw, 38px);
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.12;
  color: var(--cx-text-primary);
  text-wrap: balance;
}

/* 场次三联: DATE / TIME / HALL */
.showtime {
  display: flex;
  align-items: stretch;
  gap: var(--cx-space-5);
  padding: var(--cx-space-4) 0 2px;
  border-top: 1px dashed rgba(255, 255, 255, 0.14);
  border-bottom: 1px dashed rgba(255, 255, 255, 0.14);
}

.show-date,
.show-clock,
.show-hall {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.d-label,
.c-label,
.h-label,
.s-label {
  font-family: var(--cx-font-mono);
  font-size: 9px;
  letter-spacing: 0.24em;
  color: var(--cx-text-muted);
}

.d-value {
  font-family: var(--cx-font-mono);
  font-size: 15px;
  color: var(--cx-text-secondary);
  letter-spacing: 0.04em;
}

.c-value {
  font-family: var(--cx-font-mono);
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  color: var(--cx-color-primary);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

.h-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--cx-text-primary);
}

/* 座位印章 */
.seats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.s-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.seat-stamp {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  padding: 5px 14px;
  border-radius: 4px;
  border: 1.5px solid color-mix(in srgb, var(--cx-color-primary) 65%, transparent);
  background: color-mix(in srgb, var(--cx-color-primary) 10%, transparent);
  color: var(--cx-color-primary);
  font-family: var(--cx-font-mono);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  transform: rotate(-1.2deg);

  &:nth-child(even) { transform: rotate(1.4deg); }

  &--none {
    border-style: dashed;
    opacity: 0.5;
  }
}

/* ===== 状态图章 ===== */
.stamp {
  position: absolute;
  top: 26px;
  right: 34px;
  padding: 10px 22px;
  border-radius: 8px;
  border: 3px double currentColor;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  transform: rotate(-9deg);
  opacity: 0.88;
  mix-blend-mode: screen;
  pointer-events: none;
  animation: stamp-in 0.5s var(--cx-ease-out) 0.28s both;

  &--paid     { color: var(--cx-success); }
  &--unpaid   { color: var(--cx-warning); }
  &--refunded { color: var(--cx-info); }
  &--closed   { color: var(--cx-text-muted); }
}

@keyframes stamp-in {
  0%   { opacity: 0; transform: rotate(-9deg) scale(1.7); filter: blur(3px); }
  60%  { opacity: 0.95; filter: blur(0); }
  100% { opacity: 0.88; transform: rotate(-9deg) scale(1); }
}

/* ===== 撕票线 ===== */
.perf {
  position: relative;
  height: 28px;
}

.perf-line {
  position: absolute;
  left: 34px;
  right: 34px;
  top: 50%;
  border-top: 2px dashed rgba(255, 255, 255, 0.2);
}

.notch {
  position: absolute;
  top: 50%;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  transform: translateY(-50%);
  /* 撕票齿孔: 挖进票纸的缺口 */
  background: var(--cx-bg-base);
  border: 1px solid color-mix(in srgb, var(--cx-color-primary) 18%, transparent);

  &--left  { left: -14px; }
  &--right { right: -14px; }
}

/* ===== 票根 ===== */
.stub {
  padding: var(--cx-space-2) var(--cx-space-8) var(--cx-space-6);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent 40%);
}

.stub-grid {
  display: grid;
  grid-template-columns: 2fr 1.2fr 1fr 1.2fr;
  gap: var(--cx-space-5);
  align-items: end;

  /* 非退款单只有 3 个 cell, 用 4 列会留一格空白、金额不在最右 */
  &--single { grid-template-columns: 2fr 1.4fr 1.2fr; }
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;

  .c-mono {
    font-family: var(--cx-font-mono);
    font-size: 13px;
    color: var(--cx-text-secondary);
    letter-spacing: 0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &--amount .c-amount {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-family: var(--cx-font-mono);
    font-size: 28px;
    font-weight: 700;
    color: var(--cx-color-primary);
    font-variant-numeric: tabular-nums;

    .old-price {
      font-size: 13px;
      font-weight: 400;
      color: var(--cx-text-muted);
      text-decoration: line-through;
    }
  }
}

.stub-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cx-space-5);
  margin-top: var(--cx-space-5);
}

.barcode {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 44px;
  padding: 4px 10px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);

  i {
    display: block;
    height: 100%;
    background: rgba(244, 244, 245, 0.82);
    border-radius: 1px;
  }
}

.fineprint {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--cx-text-muted);
  text-align: right;
}

/* ===== 响应式 ===== */
@media (max-width: 720px) {
  .face {
    grid-template-columns: 1fr;
    padding: var(--cx-space-6) var(--cx-space-5);

    .poster {
      max-width: 200px;
      margin: 0 auto;
    }
  }

  .ticket-head { padding: 10px 16px; }
  .ticket-head .kicker:last-child { display: none; }

  .stamp {
    top: 14px;
    right: 16px;
    font-size: 16px;
    padding: 7px 14px;
    letter-spacing: 0.14em;
    text-indent: 0.14em;
  }

  .showtime {
    flex-wrap: wrap;
    gap: var(--cx-space-4);
  }

  .c-value { font-size: 28px; }

  .stub { padding: var(--cx-space-2) var(--cx-space-5) var(--cx-space-5); }

  .stub-grid {
    grid-template-columns: 1fr 1fr;
    gap: var(--cx-space-4);
  }

  .stub-foot {
    flex-direction: column;
    align-items: stretch;
    gap: var(--cx-space-3);
  }

  .fineprint { text-align: left; }
}
</style>
