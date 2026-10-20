<script setup lang="ts">
/**
 * 影厅座位图编辑器 (Phase 3 草稿/发布 + Phase 4 情侣对).
 *
 * 工作流:
 *   拉草稿(后端从当前版本复制一份) → 在网格上改 → 保存草稿 → 发布
 *
 * 几个必须知道的约束:
 *
 * 1. **发布会被未放映场次挡住**. 改座位图会让已售的票对不上座位, 所以只要有场次
 *    还没放映, 后端就拒绝发布并返回场次 id 列表. 这不是 bug, 是设计.
 *
 * 2. **保存带乐观锁**. 每次保存要把当前 lockVersion 回传, 不匹配说明别人改过 → 409.
 *
 * 3. **情侣对按坐标配对, 不是按 id**. 新增的座位保存前还没有 id, 所以配对传的是
 *    (y,x). 一对必须同排且左右相邻, 服务端会校验.
 *
 * 4. **座位类型和配对的关系**. 配对成功时后端自动把这两个座位的 type 置为 2(情侣),
 *    解开时退回 1. 编辑器不用自己管 type, 只管配对.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { hallApi, hallSeatApi } from '@/api';
import SeatLegend from '@/components/SeatLegend.vue';
import { confirmAction } from '@/composables/useConfirm';
import { useCouplePairs } from '@/composables/useCouplePairs';
import { seatTypeLabel, seatVisualType, type Hall, type Seat, type SeatVisualType } from '@/types';

const route = useRoute();
const router = useRouter();
const hallId = computed(() => Number(route.params.id));

const hall = ref<Hall | null>(null);
const loading = ref(true);
const saving = ref(false);
const applying = ref(false);
const dirty = ref(false);

/** 当前草稿的乐观锁版本. 每次保存后 +1. */
const lockVersion = ref(0);

/** 编辑中的网格: `${y}-${x}` -> 单元格. */
interface Cell {
  y: number;
  x: number;
  /** 后端 seat id. 新增的格子为 null. */
  seatId: number | null;
  /** 0 无座位(过道) / 1 正常. */
  status: number;
  /** 1 标准 / 2 情侣 / 3 VIP / 4 无障碍. */
  type: number;
}
const grid = ref<Map<string, Cell>>(new Map());

/**
 * 默认画布尺寸. 实际画布会按后端草稿里的最大坐标自动扩展 ——
 * 早先写死 12×16 并在 buildGrid 里 continue 掉超界座位, 而保存是全量提交,
 * 结果是一保存就把超界座位永久删掉.
 */
const MIN_ROWS = 12;
const MIN_COLS = 16;
const rows = ref(MIN_ROWS);
const cols = ref(MIN_COLS);

// ===== 画笔 =====
type Brush = 'standard' | 'vip' | 'accessible' | 'aisle';
const brush = ref<Brush>('standard');
const BRUSHES: Array<{ key: Brush; label: string }> = [
  { key: 'standard', label: '标准座' },
  { key: 'vip', label: 'VIP 座' },
  { key: 'accessible', label: '无障碍' },
  { key: 'aisle', label: '擦除/过道' },
];

/**
 * 左键点格子的行为.
 *  - paint: 按当前画笔涂格子
 *  - pair:  配对/解绑情侣对
 * 做成显式模式而不是「左键涂、右键配」: 右键在触控板/网页上不好发现, 也容易误触.
 */
const mode = ref<'paint' | 'pair'>('paint');

function onCellClick(y: number, x: number) {
  if (mode.value === 'pair') togglePair(y, x);
  else paint(y, x);
}

const key = (y: number, x: number) => `${y}-${x}`;

function cellAt(y: number, x: number): Cell | undefined {
  return grid.value.get(key(y, x));
}

// 情侣对配对逻辑(状态 + 领域规则)抽在 composable 里, 这里只管渲染和保存
const {
  pairs,
  pairAnchor,
  pairIndexOf,
  isPairLeft,
  isPairRight,
  pairRange,
  togglePair,
  removePairsAt,
  clearPairs,
  buildPairs: buildPairsFromGroups,
} = useCouplePairs({ cellAt, markDirty: () => { dirty.value = true; } });

/**
 * 这一格该画成哪种样式. 用共享的 {@link seatVisualType} 归一, 保证跟预览页/选座页一致.
 *
 * 传 paired 是因为编辑器里配对关系还没保存(后端还没把 type 同步成 2), 得本地算.
 */
function cellClassOf(y: number, x: number): SeatVisualType {
  return seatVisualType(cellAt(y, x), pairIndexOf(y, x) >= 0);
}

// ===== 编辑动作 =====

/** 涂格子. 过道 = status 0. 涂过道时顺手解掉它参与的情侣对. */
function paint(y: number, x: number) {
  const k = key(y, x);
  const cell = grid.value.get(k);
  if (!cell) return;
  if (brush.value === 'aisle') {
    cell.status = 0;
    cell.type = 1;
    // 涂成过道就解掉它参与的情侣对, 否则会留下一对里有一格是过道
    removePairsAt(y, x);
  } else {
    cell.status = 1;
    cell.type = brush.value === 'vip' ? 3 : brush.value === 'accessible' ? 4 : 1;
  }
  dirty.value = true;
}

function fillAll() {
  grid.value.forEach((c) => {
    if (c.status === 0) {
      c.status = 1;
      c.type = 1;
    }
  });
  dirty.value = true;
}

async function clearAll() {
  const ok = await confirmAction(
    '将清空所有座位并解除全部情侣对，已保存的草稿不会自动恢复。确定继续？',
    '全部清空',
    { confirmButtonText: '清空' },
  );
  if (!ok) return;

  grid.value.forEach((c) => {
    c.status = 0;
    c.type = 1;
  });
  clearPairs();
  dirty.value = true;
}

const stats = computed(() => {
  let sellable = 0;
  grid.value.forEach((c) => {
    if (c.status === 1) sellable++;
  });
  return { sellable, couples: pairs.value.length };
});

// ===== 网络 =====

/**
 * 后端 seat 行 → 编辑器网格. 空的地方补成过道格, 保证画布完整.
 * 画布尺寸取「默认 12×16」与「实际座位最大坐标」的较大者: 模板导入的
 * 大画布(如 20×30)也能完整显示, 不会在保存时被静默裁掉.
 */
function buildGrid(seats: Seat[]) {
  const maxY = seats.reduce((m, s) => Math.max(m, s.y), 0);
  const maxX = seats.reduce((m, s) => Math.max(m, s.x), 0);
  rows.value = Math.max(MIN_ROWS, maxY);
  cols.value = Math.max(MIN_COLS, maxX);

  const m = new Map<string, Cell>();
  for (let y = 1; y <= rows.value; y++) {
    for (let x = 1; x <= cols.value; x++) m.set(key(y, x), { y, x, seatId: null, status: 0, type: 1 });
  }
  for (const s of seats) {
    m.set(key(s.y, s.x), {
      y: s.y,
      x: s.x,
      seatId: s.id,
      status: s.status,
      type: typeof s.type === 'number' ? s.type : 1,
    });
  }
  grid.value = m;
}

/** 后端情侣对 → 坐标对. 用 seatId 反查坐标, 坐标配对逻辑见 useCouplePairs. */
function buildPairs(groups: Array<{ seatId1: number; seatId2: number }>) {
  const coordById = new Map<number, { y: number; x: number }>();
  grid.value.forEach((c) => {
    if (c.seatId != null) coordById.set(c.seatId, { y: c.y, x: c.x });
  });
  buildPairsFromGroups(groups, coordById);
}

async function load() {
  loading.value = true;
  try {
    const [h, draft] = await Promise.all([hallApi.detail(hallId.value), hallSeatApi.draft(hallId.value)]);
    hall.value = h;
    lockVersion.value = draft.lockVersion;
    buildGrid(draft.seats ?? []);
    buildPairs(draft.coupleGroups ?? []);
    dirty.value = false;
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

async function save(quiet = false) {
  saving.value = true;
  try {
    const payload = {
      expectedLockVersion: lockVersion.value,
      seats: [...grid.value.values()]
        // 没动过的空过道格不用传, 但传了也无害; 只传「有位置信息」的格更省流量.
        // 这里全传, 保证后端整表替换的语义和前端所见完全一致.
        .map((c) => ({
          id: c.seatId,
          y: c.y,
          x: c.x,
          status: c.status,
          unitType: c.type,
        })),
      coupleGroups: pairs.value.map((p) => ({
        y1: p.y1,
        x1: p.x1,
        y2: p.y2,
        x2: p.x2,
      })),
    };
    await hallSeatApi.saveDraft(hallId.value, payload);
    lockVersion.value += 1;
    dirty.value = false;
    if (!quiet) ElMessage.success('草稿已保存');
    // 重新拉一次把新座位的 id 拿回来(新格子保存前 seatId 是 null)
    const draft = await hallSeatApi.draft(hallId.value);
    lockVersion.value = draft.lockVersion;
    buildGrid(draft.seats ?? []);
    buildPairs(draft.coupleGroups ?? []);
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '保存失败');
    throw err;
  } finally {
    saving.value = false;
  }
}

async function apply() {
  applying.value = true;
  try {
    // 发布前先落盘, 否则改的还没保存
    if (dirty.value) await save(true);
    const r = await hallSeatApi.apply(hallId.value);
    if (r.ok) {
      ElMessage.success(r.message ?? '已发布');
      await load();
      return;
    }
    const ids = (r.blockingScheduleIds ?? []).join(', ');
    await ElMessageBox.alert(
      `${r.message}${ids ? `\n\n涉及场次 id: ${ids}` : ''}`,
      '发布被拒绝',
      { type: 'warning', confirmButtonText: '知道了' },
    ).catch(() => null);
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '发布失败');
  } finally {
    applying.value = false;
  }
}

async function discard() {
  const ok = await confirmAction(
    '丢弃草稿会退回当前已发布的座位图, 未保存的修改会丢失. 继续?',
    '丢弃草稿',
  );
  if (!ok) return;
  try {
    await hallSeatApi.dropDraft(hallId.value);
    ElMessage.success('已丢弃草稿');
    await load();
  } catch (err) {
    ElMessage.error((err as { msg?: string })?.msg ?? '丢弃失败');
  }
}

onMounted(load);

// ===== 未保存修改防丢失 =====
// 画半小时座位图, 误点「返回影厅列表」或刷新就全没了 —— dirty 时两道闸:
// SPA 内跳路由弹确认框, 关页/刷新生效 beforeunload 原生提示.
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  return await confirmAction(
    '有未保存的修改，离开后将丢失。确定离开？',
    '未保存的修改',
    { confirmButtonText: '离开', cancelButtonText: '留下' },
  );
});

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));
</script>

<template>
  <div class="seat-editor">
    <header class="header">
      <div>
        <h1 class="title">座位图编辑 · {{ hall?.name ?? '' }}</h1>
        <p class="subtitle">
          可售 {{ stats.sellable }} 座 · 情侣对 {{ stats.couples }} 组
          <span v-if="dirty" class="dirty">· 有未保存的修改</span>
        </p>
      </div>
      <div class="actions">
        <!-- 回列表页用明确的路由, 不用 router.back(): 直接打开/刷新这个地址时
             没有历史记录, back() 会原地不动或者跳到一个莫名其妙的地方 -->
        <el-button @click="router.push({ name: 'admin-halls' })">返回影厅列表</el-button>
        <el-button plain @click="router.push({ name: 'admin-hall-info', params: { id: hallId } })">
          预览
        </el-button>
        <el-button @click="discard">丢弃草稿</el-button>
        <el-button :loading="saving" @click="save()">保存草稿</el-button>
        <el-button type="primary" :loading="applying" @click="apply">发布</el-button>
      </div>
    </header>

    <PageSkeleton v-if="loading" :rows="6" :show-header="false" />

    <template v-else>
      <el-card class="toolbar cx-glass">
        <div class="line">
          <span class="label">模式</span>
          <el-radio-group v-model="mode" size="small">
            <el-radio-button value="paint">涂座位</el-radio-button>
            <el-radio-button value="pair">配情侣对</el-radio-button>
          </el-radio-group>
        </div>
        <div class="line" v-if="mode === 'paint'">
          <span class="label">画笔</span>
          <el-radio-group v-model="brush" size="small">
            <el-radio-button v-for="b in BRUSHES" :key="b.key" :value="b.key">
              {{ b.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
        <div class="line">
          <span class="label">操作</span>
          <el-tag v-if="pairAnchor" type="warning" effect="dark" closable @close="pairAnchor = null">
            已选第 {{ pairAnchor.y }} 排 {{ pairAnchor.x }} 列, 再点相邻一格完成配对
          </el-tag>
          <el-button size="small" @click="fillAll">全部填充</el-button>
          <el-button size="small" @click="clearAll">全部清空</el-button>
        </div>
        <p class="hint">
          情侣对必须<b>同一排、左右相邻</b>. 配对后这两个座位的类型会自动变成「情侣」, 票价 2.5 倍,
          并且下单时必须一起买 —— 在后端强制, 只买一半会被拒.
          要解绑就再点一次已配对的格子.
        </p>
      </el-card>

      <el-card class="grid-card cx-glass">
        <div class="screen-wrap">
          <div class="screen" aria-hidden="true" />
          <span class="screen-label">银幕</span>
        </div>
        <!-- 列宽 40px: 格子里显示的是「行-列」(如 12-16), 28px 装不下会截断 -->
        <div class="seat-grid" :style="{ gridTemplateColumns: `32px repeat(${cols}, 40px)` }">
          <!--
            每一格都显式指定 grid-row / grid-column, 不依赖自动排布.
            列号要 +1: 第 1 列是排号, 座位 x 落在 grid 的 x+1 列.
          -->
          <template v-for="y in rows" :key="y">
            <div class="row-label" :style="{ gridColumn: 1, gridRow: y }">{{ y }}</div>
            <template v-for="x in cols" :key="`${y}-${x}`">
              <!--
                情侣对的右半格**不渲染** —— 左半格已用 grid-column span 横跨过来.
                放"占位元素"不行: 那种元素本身是 grid item, 会占掉一格, 整排被挤右一格,
                最后一个座位换行并落进排号列, 之后每排排号都错位.
              -->
              <button
                v-if="!isPairRight(y, x)"
                :key="`s-${y}-${x}`"
                class="cell"
                :class="{
                  aisle: cellAt(y, x)?.status === 0,
                  standard: cellClassOf(y, x) === 'standard',
                  vip: cellClassOf(y, x) === 'vip',
                  accessible: cellClassOf(y, x) === 'accessible',
                  couple: cellClassOf(y, x) === 'couple',
                  anchor: pairAnchor && pairAnchor.y === y && pairAnchor.x === x,
                  'couple-left': pairIndexOf(y, x) >= 0 && isPairLeft(y, x),
                }"
                :style="pairIndexOf(y, x) >= 0 && isPairLeft(y, x)
                  ? { gridColumn: `${x + 1} / span ${pairRange(y, x)}`, gridRow: y }
                  : { gridColumn: x + 1, gridRow: y }"
                :title="`第${y}排 第${x}列 · ${cellAt(y, x)?.status === 1 ? seatTypeLabel(cellAt(y, x)?.type) : '过道'}`"
                @click="onCellClick(y, x)"
              >
                {{ cellAt(y, x)?.status === 1 ? `${y}-${x}` : '' }}
              </button>
            </template>
          </template>
        </div>

        <!-- 图例: 画笔按钮只有文字, 不画出来看不清哪种颜色对应哪种座位 -->
        <SeatLegend class="legend" />
        <p class="hint">
          画笔涂出的是<b>标准 / VIP / 无障碍</b>三种; <b>情侣座</b>由「配情侣对」点两格生成,
          不用画笔(配对成功后这两格的类型会自动变成情侣). 过道格子占位但不卖票, 不计入座位数.
        </p>
      </el-card>
    </template>
  </div>
</template>

<style scoped lang="scss">
.seat-editor {
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

  .title { font-size: 24px; font-weight: 700; margin: 0; }
  .subtitle { color: var(--cx-text-secondary); font-size: 13px; margin: 6px 0 0; }
  .dirty { color: var(--el-color-warning); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
}

.toolbar {
  .line {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .label {
    font-size: 13px;
    color: var(--cx-text-secondary);
    min-width: 32px;
  }
}

.hint {
  font-size: 12px;
  color: var(--cx-text-muted);
  margin: 8px 0 0;
  line-height: 1.6;
}

.grid-card { padding: var(--cx-space-5); }

.screen-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--cx-space-4);
}
/* 8px 高的渐变条装不下「银幕」二字, 文字改作下方标注 */
.screen-label {
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--cx-text-muted);
}
.screen {
  width: 55%;
  height: 8px;
  background: linear-gradient(180deg, var(--cx-color-primary), transparent);
  border-radius: 50%;
}

.seat-grid {
  display: grid;
  gap: 4px;
  /* safe center: 画布比容器宽时从左侧开始排列, 否则居中溢出会导致左侧列无法滚动到 */
  justify-content: safe center;
  overflow-x: auto;
  padding-bottom: 8px;
}

.row-label {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cx-text-muted);
  font-size: 12px;
}

.legend {
  margin-top: var(--cx-space-4);
}

.cell {
  height: 28px;
  border-radius: 4px;
  border: 1px solid var(--cx-border);
  background: rgba(255, 255, 255, 0.08);
  color: var(--cx-text-primary);
  font-size: 10px;
  cursor: pointer;
  padding: 0;
  transition: transform 0.08s;

  &:hover { transform: scale(1.08); }

  /* 过道: 空白不可点区域, 但仍然占格 */
  &.aisle {
    background: transparent;
    border-style: dashed;
    border-color: var(--cx-seat-aisle-border);
    color: transparent;
  }

  /* 座位类型配色统一走 theme.scss 的 --cx-seat-* 令牌, 跟预览页/选座页共用 */
  &.standard {
    background: var(--cx-seat-standard-bg);
    border-color: var(--cx-seat-standard-border);
    color: var(--cx-seat-standard-text);
  }

  &.vip {
    background: var(--cx-seat-vip-bg);
    border-color: var(--cx-seat-vip-border);
    color: var(--cx-seat-vip-text);
  }

  &.accessible {
    background: var(--cx-seat-accessible-bg);
    border-color: var(--cx-seat-accessible-border);
    color: var(--cx-seat-accessible-text);
  }

  &.couple {
    background: var(--cx-seat-couple-bg);
    border-color: var(--cx-seat-couple-border);
    color: var(--cx-seat-couple-text);
    &.couple-left { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  }

  &.anchor {
    outline: 2px solid var(--el-color-warning);
    outline-offset: 1px;
  }
}

</style>
