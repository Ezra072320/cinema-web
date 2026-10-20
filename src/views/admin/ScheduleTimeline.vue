<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { hallApi, scheduleApi } from '@/api';
import type { Hall, Schedule } from '@/types';
import TimelinePop from './TimelinePop.vue';
import {
  CLICK_TOLERANCE_PX,
  HALL_COL_WIDTH,
  HEADER_HEIGHT,
  PX_PER_MIN,
  ROW_HEIGHT,
  SNAP_MIN,
  SPAN_MIN,
  TRACK_WIDTH,
  axisMinToClock,
  snap,
  useTimelineDrag,
  type Block,
} from '@/composables/useTimelineDrag';

/**
 * 排片时间轴: 单日 · 影厅行甘特.
 *
 * 横轴是完整 24 小时(00:00–24:00), 每个影厅一行, 场次是色块
 * (宽 = 片长 + 30 分钟清场, 直接读已落库的 startTime/endTime;
 * 跨午夜场次在右缘截断, 次日段归次日视图).
 *
 * 交互:
 * - 拖动色块改开场时间(同厅, 5 分钟吸附, 松手调 update, 失败弹回) —— 逻辑在 useTimelineDrag;
 * - 点空白处在该厅该时间快速排片(emit 给父组件开批量对话框);
 * - 点色块弹出操作(编辑/取消场次/删除) —— 弹层是 TimelinePop 组件.
 *
 * 所有裁决都在服务端(未来时间/未开场/未取消/冲突排除自身),
 * 前端只做预览 —— 后端零改动.
 */

const props = defineProps<{ date: string }>();
const emit = defineEmits<{
  edit: [row: Schedule];
  cancel: [row: Schedule];
  remove: [row: Schedule];
  create: [prefill: { hallId: number; date: string; time: string }];
}>();

// 几何常量(TRACK_WIDTH/PX_PER_MIN/…)与 Block 类型都在 useTimelineDrag —— 同一套几何只留一份定义.

/** 8 色盘, 暗色主题下高对比; 按 movieId 哈希取色, 同片同色. */
const PALETTE = [
  '#c9a96e', '#7c9cbf', '#a86ec9', '#6ec98f',
  '#c97c6e', '#6ebfc9', '#c9b86e', '#bf6e9c',
];

// ===== 数据 =====
const halls = ref<Hall[]>([]);
const schedules = ref<Schedule[]>([]);
const loading = ref(false);

const viewDate = computed(() => props.date || today());

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function reload() {
  loading.value = true;
  try {
    const [h, r] = await Promise.all([
      hallApi.list(),
      scheduleApi.adminPage({ page: 1, limit: 200, date: viewDate.value }),
    ]);
    halls.value = h;
    schedules.value = r.rows;
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '加载失败');
  } finally {
    loading.value = false;
  }
}
defineExpose({ reload });
watch(() => props.date, reload);

// ===== 时间换算(全部字符串切片, 不 new Date 解析 —— 时区坑已踩过) =====
// axisMinToClock / snap 与拖拽共用, 已从 useTimelineDrag 导入.

/** "yyyy-MM-dd HH:mm:ss" → 当日 0 分钟起的轴位置(24 小时自然日). */
function toAxisMin(dateTime: string): number {
  return Number(dateTime.slice(11, 13)) * 60 + Number(dateTime.slice(14, 16));
}

const isCanceled = (s: Schedule) => Number(s.status) === 2;
function isStarted(s: Schedule): boolean {
  // 与当天日期比较不够 —— 直接跟现在比: 只在未来才可拖
  const datePart = s.startTime.slice(0, 10);
  if (datePart > today()) return false;
  if (datePart < today()) return true;
  return s.startTime.slice(11, 16) <= nowClock.value;
}

const nowClock = ref(nowHHmm());
let clockTimer: ReturnType<typeof setInterval> | undefined;
function nowHHmm(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
onMounted(() => {
  reload();
  clockTimer = setInterval(() => {
    nowClock.value = nowHHmm();
  }, 60_000);
});
onBeforeUnmount(() => clearInterval(clockTimer));

/** 当前时间线在轴上的位置; 看的不是今天则为 null. */
const nowLineLeft = computed(() => {
  if (viewDate.value !== today()) return null;
  const d = new Date();
  return (d.getHours() * 60 + d.getMinutes()) * PX_PER_MIN;
});

function colorOf(movieId: number): string {
  return PALETTE[Math.abs(movieId) % PALETTE.length];
}

// ===== 刻度 =====
const ticks = computed(() => {
  const list: { left: number; label: string | null; major: boolean }[] = [];
  for (let min = 0; min <= SPAN_MIN; min += 30) {
    const major = min % 120 === 0;
    list.push({ left: min * PX_PER_MIN, label: major ? axisMinToClock(min) : null, major });
  }
  return list;
});

// ===== 场次块 =====
// Block 类型来自 useTimelineDrag(与拖拽共用同一份定义).
const blocksByHall = computed<Map<number, Block[]>>(() => {
  const map = new Map<number, Block[]>();
  for (const h of halls.value) map.set(h.id, []);
  for (const s of schedules.value) {
    const startAxis = toAxisMin(s.startTime);
    // date 过滤保证开场在当日; 跨午夜场次的结束段在右缘截断, 次日段归次日视图
    const endAxis = toAxisMin(s.endTime) + (s.endTime.slice(0, 10) > s.startTime.slice(0, 10) ? 1440 : 0);
    if (startAxis >= SPAN_MIN) continue;
    const left = startAxis * PX_PER_MIN;
    const right = Math.min(SPAN_MIN, endAxis) * PX_PER_MIN;
    const canceled = isCanceled(s);
    const started = isStarted(s);
    const b: Block = {
      row: s,
      left,
      width: Math.max(10, right - left),
      color: colorOf(s.movieId),
      canceled,
      started,
      draggable: !canceled && !started,
      timeText: s.startTime.slice(11, 16),
    };
    if (!map.has(s.hallId)) map.set(s.hallId, []);
    map.get(s.hallId)!.push(b);
  }
  return map;
});

// ===== 操作弹层 =====
const pop = ref<{ block: Block; x: number; y: number } | null>(null);
function closePop() {
  pop.value = null;
}

function openPop(b: Block) {
  // 弹层定位在内容坐标系里(跟随横向滚动), 横向别越出轨道
  pop.value = {
    block: b,
    x: Math.min(b.left + 8, TRACK_WIDTH - 270),
    y: HEADER_HEIGHT + hallIndex(b.row.hallId) * ROW_HEIGHT + 6,
  };
}

function hallIndex(hallId: number): number {
  return halls.value.findIndex((h) => h.id === hallId);
}

// ===== 拖拽 =====
const wrapEl = ref<HTMLElement>();
// 拖拽交互(状态 + window 指针监听 + 松手改期)整段在 useTimelineDrag;
// 这里把弹层开闭与数据重载注入进去.
const { drag, dragHint, onBlockDown } = useTimelineDrag({ viewDate, openPop, closePop, reload });

// ===== 空白点击 → 快速排片 =====
/**
 * 触屏上横向滑动时间轴时也会先 pointerdown: 早先这里立刻弹排片对话框,
 * 用户想滚动却被意外打断. 改为记录起点, 仅在 pointerup 且位移 < 阈值时才触发,
 * 与场次块的点击/拖拽判定口径一致.
 */
let rowPointer: {
  hallId: number;
  startX: number;
  startY: number;
  rowEl: HTMLElement;
} | null = null;

function cleanupRowPointer() {
  window.removeEventListener('pointerup', onRowUp);
  window.removeEventListener('pointercancel', onRowCancel);
  rowPointer = null;
}

function onRowDown(hallId: number, e: PointerEvent) {
  // 只在行背景上触发(块上会 stopPropagation)
  if (e.button !== 0) return;
  cleanupRowPointer();
  rowPointer = {
    hallId,
    startX: e.clientX,
    startY: e.clientY,
    rowEl: e.currentTarget as HTMLElement,
  };
  closePop();
  window.addEventListener('pointerup', onRowUp);
  window.addEventListener('pointercancel', onRowCancel);
}

function onRowCancel() {
  cleanupRowPointer();
}

function onRowUp(e: PointerEvent) {
  const p = rowPointer;
  if (!p) return;
  cleanupRowPointer();

  const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
  if (moved > CLICK_TOLERANCE_PX) return;

  const rect = p.rowEl.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const axisMin = Math.max(0, Math.min(SPAN_MIN - SNAP_MIN, snap(x / PX_PER_MIN)));
  emit('create', { hallId: p.hallId, date: viewDate.value, time: axisMinToClock(axisMin) });
}

function popAction(kind: 'edit' | 'cancel' | 'remove') {
  const b = pop.value?.block;
  if (!b) return;
  closePop();
  if (kind === 'edit') emit('edit', b.row);
  else if (kind === 'cancel') emit('cancel', b.row);
  else emit('remove', b.row);
}
</script>

<template>
  <div
    ref="wrapEl"
    v-loading="loading"
    class="timeline cx-glass"
    :style="{ '--hall-col-w': `${HALL_COL_WIDTH}px` }"
    @click.self="closePop"
  >
    <!-- 表头: 影厅名列 + 时间刻度 -->
    <div class="tl-header">
      <div class="hall-col head">影厅</div>
      <div class="track head-track" :style="{ width: `${TRACK_WIDTH}px` }">
        <div
          v-for="t in ticks"
          :key="t.left"
          class="tick"
          :class="{ major: t.major }"
          :style="{ left: `${t.left}px` }"
        >
          <span v-if="t.label" class="tick-label">{{ t.label }}</span>
        </div>
      </div>
    </div>

    <!-- 每个影厅一行 -->
    <div v-for="h in halls" :key="h.id" class="tl-row">
      <div class="hall-col">
        <span class="hall-name">{{ h.name }}</span>
        <span class="hall-cap">{{ h.capacity > 0 ? `${h.capacity} 座` : '未画座位图' }}</span>
      </div>
      <div class="track" :style="{ width: `${TRACK_WIDTH}px` }" @pointerdown="onRowDown(h.id, $event)">
        <!-- 格线 -->
        <div
          v-for="t in ticks"
          :key="t.left"
          class="grid-line"
          :class="{ major: t.major }"
          :style="{ left: `${t.left}px` }"
        />
        <!-- 当前时间线 -->
        <div v-if="nowLineLeft != null" class="now-line" :style="{ left: `${nowLineLeft}px` }" />
        <!-- 场次块 -->
        <div
          v-for="b in blocksByHall.get(h.id) ?? []"
          :key="b.row.id"
          class="block"
          :class="{
            canceled: b.canceled,
            started: b.started,
            draggable: b.draggable,
            dragging: drag?.block === b && drag?.moved,
          }"
          :style="{
            left: `${drag?.block === b && drag.moved ? drag.curLeft : b.left}px`,
            width: `${b.width}px`,
            background: b.color,
          }"
          :title="`${b.row.movieName || ''} ${b.row.startTime} ~ ${b.row.endTime}`"
          role="button"
          tabindex="0"
          @pointerdown="onBlockDown(b, $event)"
          @keydown.enter="openPop(b)"
          @keydown.space.prevent="openPop(b)"
        >
          <span class="b-title">{{ b.row.movieName || `#${b.row.movieId}` }}</span>
          <span class="b-time">{{ b.timeText }}</span>
        </div>
        <!-- 拖拽目标时间浮签(放在轨道里, 块内会被 overflow 裁掉) -->
        <div
          v-if="dragHint && dragHint.hallId === h.id"
          class="drag-hint"
          :style="{ left: `${dragHint.left}px` }"
        >
          {{ dragHint.text }}
        </div>
        <!-- 空厅提示 -->
        <div v-if="!(blocksByHall.get(h.id) ?? []).length" class="empty-hint">
          当日暂无排片，点击空白处快速排片
        </div>
      </div>
    </div>

    <!-- 操作弹层: 弹层本体与 ESC/焦点处理在 TimelinePop -->
    <TimelinePop
      v-if="pop"
      :block="pop.block"
      :x="pop.x"
      :y="pop.y"
      @close="closePop"
      @action="popAction"
    />
  </div>
</template>

<style scoped lang="scss">
.timeline {
  position: relative;
  overflow-x: auto;
  border-radius: var(--cx-radius-lg);
  padding: var(--cx-space-2) 0;
  user-select: none;
}

.tl-header,
.tl-row {
  display: flex;
  align-items: stretch;
}

.hall-col {
  /* 宽度与 TimelinePop 定位偏移同源于 useTimelineDrag 的 HALL_COL_WIDTH, 不许写死 */
  flex: 0 0 var(--hall-col-w);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 var(--cx-space-3);
  border-right: 1px solid var(--cx-border);
  position: sticky;
  left: 0;
  z-index: 3;
  background: var(--cx-bg-elevated);

  &.head {
    justify-content: flex-end;
    padding-bottom: 6px;
    font-size: 12px;
    color: var(--cx-text-muted);
  }

  .hall-name {
    font-weight: 600;
    font-size: 14px;
  }
  .hall-cap {
    font-size: 11px;
    color: var(--cx-text-muted);
  }
}

.head-track {
  height: 34px;
  border-bottom: 1px solid var(--cx-border);
}

.track {
  position: relative;
  /* 宽度由模板绑定 TRACK_WIDTH(24h × 2px), 别在这里写死 ——
     早先 CSS 是 2160px(18h), 与 JS 常量 2880px 不一致, 18 点后刻度出轨. */
  min-height: 64px;
  cursor: crosshair;
}

.tl-row .track {
  border-bottom: 1px solid var(--cx-border);
}

.tick {
  position: absolute;
  bottom: 0;
  width: 1px;
  height: 6px;
  background: var(--cx-border);

  &.major {
    height: 10px;
  }
  .tick-label {
    position: absolute;
    bottom: 10px;
    left: 2px;
    font-size: 11px;
    color: var(--cx-text-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
}

.grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: color-mix(in srgb, var(--cx-border) 40%, transparent);
  pointer-events: none;

  &.major {
    background: var(--cx-border);
  }
}

.now-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--cx-danger);
  z-index: 2;
  pointer-events: none;
}

.block {
  position: absolute;
  top: 8px;
  height: 48px;
  border-radius: var(--cx-radius-md);
  padding: 4px 8px;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--cx-color-primary-contrast);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  z-index: 2;
  touch-action: none;

  &.draggable {
    cursor: grab;
  }
  &.dragging {
    cursor: grabbing;
    opacity: 0.85;
    z-index: 5;
    box-shadow: var(--cx-shadow-lg);
  }
  &.canceled {
    opacity: 0.3;
    text-decoration: line-through;
  }
  &.started {
    opacity: 0.55;
    filter: saturate(0.5);
  }

  .b-title {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .b-time {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }
}

.drag-hint {
  position: absolute;
  top: 2px;
  z-index: 6;
  background: var(--cx-color-primary-contrast);
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
}

.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--cx-text-muted);
  opacity: 0.6;
  pointer-events: none;
}
</style>
