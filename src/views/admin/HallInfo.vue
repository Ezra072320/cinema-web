<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { hallApi } from '@/api';
import SeatLegend from '@/components/SeatLegend.vue';
import { useSeatGrid, type GridSeat } from '@/composables/useSeatGrid';
import {
  hallTypeLabel as hallTypeText,
  seatTypeLabel,
  seatVisualType,
  type Hall,
} from '@/types';

const route = useRoute();
const router = useRouter();
const hallId = computed(() => Number(route.params.id));

const hall = ref<Hall | null>(null);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    hall.value = await hallApi.detail(hallId.value);
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

/** 后端 Seat 用 id, 网格几何用 seatId. 转一道, 让几何逻辑三个页面共用. */
interface GridSeatRow extends GridSeat {
  status: number;
  type: number;
}
const gridSeats = computed<GridSeatRow[]>(() =>
  (hall.value?.seats ?? []).map((s) => ({
    seatId: s.id,
    x: s.x,
    y: s.y,
    status: s.status,
    type: typeof s.type === 'number' ? s.type : 1,
  })),
);

/** 情侣对几何 + 座位编号, 与选座页共用同一份实现. */
const { seatAt, isCouple, isRightHalf, cellStyle, rowLabelStyle, rowNos, seatNumber } =
  useSeatGrid<GridSeatRow>(gridSeats, computed(() => hall.value?.coupleGroups));

/**
 * 要渲染哪些排 —— **按实际座位重新编号后的排号**.
 *
 * 这一页是"座位图成品"的展示, 过道不渲染, 所以编号也得跟着重来:
 * 一排里 x 是 1,2,4,5 的话, 观众看到的应该是 1排1号~1排4号, 中间不跳号;
 * 整排都是过道的排也不占号. 物理坐标 (y, x) 是编辑器里画的格子坐标, 不是座位号.
 *
 * 每格的 grid-row 都是显式写死的, 所以跳着渲染也不会错位.
 */
const rows = computed(() =>
  [...rowNos.value.entries()].sort((a, b) => a[1] - b[1]).map(([y]) => y),
);

/** 这一格是不是真座位. 不是(过道 / 压根没这一行)就不渲染. */
function isSeat(x: number, y: number): boolean {
  return seatAt(x, y)?.status === 1;
}

/**
 * 列数按实际座位算, 不能写死.
 *
 * 座位图编辑器默认就是 16 列, 这里写死 12 的话第 13~16 列的座位直接不渲染 ——
 * 看着像"座位丢了", 其实是网格宽度不够.
 */
const cols = computed(() => {
  const xs = gridSeats.value.map((s) => s.x);
  return xs.length ? Math.max(...xs) : 12;
});

/**
 * 座位在格子里的显示名, 如 `3-5` = 第 3 排第 5 号.
 *
 * **不是物理坐标** —— 用的是本排序号, 过道不占号(见 useSeatGrid 的 seatNumber).
 */
function seatName(y: number, x: number) {
  const s = seatAt(x, y);
  return s ? seatNumber(y, s.seatId) : '';
}

function seatLabel(s: GridSeatRow | undefined) {
  if (!s) return '';
  return seatTypeLabel(s.type);
}

/**
 * 这一格的样式. 用共享的 {@link seatVisualType} 归一 —— 早先这里是手写的一组
 * `type === 2 / type === 3` 判断, **漏掉了 type=4 的无障碍**, 于是无障碍座在这一页
 * 跟普通座长得一模一样. 现在四类 + 过道都由同一个函数决定, 不会再漏.
 */
function seatClassOf(seat: GridSeatRow | undefined) {
  const t = seatVisualType(seat, isCouple(seat?.seatId));
  return {
    standard: t === 'standard',
    love: t === 'couple',
    vip: t === 'vip',
    accessible: t === 'accessible',
    disabled: t === 'aisle',
  };
}

function hallTypeLabel() {
  return hall.value ? hallTypeText(hall.value.type) : '';
}

onMounted(load);
</script>

<template>
  <div class="hall-info">
    <header class="header">
      <div>
        <h1 class="title">{{ hall?.name ?? '影厅详情' }}</h1>
        <p class="subtitle" v-if="hall">
          {{ hallTypeLabel() }} ·
          {{ hall.capacity > 0 ? `${hall.capacity} 座` : '未画座位图' }} ·
          当前版本共 {{ hall.seats?.length ?? 0 }} 个座位
        </p>
      </div>
      <div class="actions">
        <!-- 回列表用明确路由而不是 router.back(): 直接打开这个地址时没有历史可退 -->
        <el-button @click="router.push({ name: 'admin-halls' })">返回影厅列表</el-button>
        <el-button
          type="primary"
          @click="router.push({ name: 'admin-hall-seats', params: { id: hallId } })"
        >
          编辑座位图
        </el-button>
      </div>
    </header>

    <PageSkeleton v-if="loading" :rows="4" :show-header="false" />

    <el-card v-else-if="hall" class="seat-card cx-glass">
      <div class="screen-wrap">
        <div class="screen" aria-hidden="true" />
        <span class="screen-label">银幕</span>
      </div>
      <!-- 每格显式定位(见 useSeatGrid 的说明), 情侣对的右半格整个不渲染 -->
      <div class="seat-grid" :style="{ gridTemplateColumns: `40px repeat(${cols}, 1fr)` }">
        <template v-for="y in rows" :key="y">
          <div class="row-label" :style="rowLabelStyle(y)">{{ rowNos.get(y) ?? y }}</div>
          <!--
            过道 / 没有座位行的地方**整个不渲染** —— 预览页只看"有哪些座位", 不需要
            把场地的空白也画出来. 这正是前面把每一格显式定位换来的好处: 少渲染几格
            不会像自动排布那样把后面整排挤歪.
          -->
          <template v-for="x in cols" :key="`${x}-${y}`">
            <div
              v-if="isSeat(x, y) && !isRightHalf(seatAt(x, y)?.seatId)"
              class="seat"
              :class="seatClassOf(seatAt(x, y))"
              :style="cellStyle(seatAt(x, y)!)"
              :aria-label="`${y}排${x}座`"
              :title="seatLabel(seatAt(x, y))"
            >
              {{ seatName(y, x) }}
            </div>
          </template>
        </template>
      </div>

      <!-- 过道这一页不画, 图例也就不必列 -->
      <SeatLegend class="legend" :aisle="false" />
    </el-card>

    <EmptyState v-else title="影厅不存在" />
  </div>
</template>

<style scoped lang="scss">
.hall-info {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-5);
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-space-4);
  flex-wrap: wrap;

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .title {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .subtitle {
    color: var(--cx-text-secondary);
    font-size: 13px;
    margin: 6px 0 0;
  }
}

.seat-card {
  padding: var(--cx-space-5);
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
}

.seat-grid {
  display: grid;
  gap: 6px;
}

.row-label {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cx-text-muted);
  font-size: 12px;
}

.seat {
  height: 32px;
  border-radius: var(--cx-radius-sm);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--cx-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--cx-text-muted);

  &.standard {
    background: var(--cx-seat-standard-bg);
    border-color: var(--cx-seat-standard-border);
    color: var(--cx-seat-standard-text);
  }

  /* 座位类型配色统一走 theme.scss 的 --cx-seat-* 令牌, 跟编辑器/选座页共用.
     合并成 2 格宽要看后端返回的情侣对(影厅详情接口不下发), 这个只读页不做,
     只用配色区分. */
  &.love {
    background: var(--cx-seat-couple-bg);
    border-color: var(--cx-seat-couple-border);
    color: var(--cx-seat-couple-text);
  }

  &.vip {
    background: var(--cx-seat-vip-bg);
    border-color: var(--cx-seat-vip-border);
    color: var(--cx-seat-vip-text);
  }

  /* 早先漏掉的就是这一类 —— 无障碍座在这页跟普通座长得一样 */
  &.accessible {
    background: var(--cx-seat-accessible-bg);
    border-color: var(--cx-seat-accessible-border);
    color: var(--cx-seat-accessible-text);
  }

  &.disabled {
    opacity: 0.4;
    background: repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.02),
      rgba(255, 255, 255, 0.02) 4px,
      rgba(255, 255, 255, 0.08) 4px,
      rgba(255, 255, 255, 0.08) 8px
    );
  }
}

/* 图例样式在 components/SeatLegend.vue 里, 这里只调位置 */
.legend {
  margin-top: var(--cx-space-4);
}
</style>
