import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { seatTypeLabel } from '@/types';

/** 情侣对的坐标表示: 一对必须同排且左右相邻(服务端也会校验). */
export interface CouplePair {
  y1: number;
  x1: number;
  y2: number;
  x2: number;
}

/** 编辑器格子的最小形状: 配对逻辑只关心可用性和类型. */
interface PairCell {
  seatId: number | null;
  status: number;
  type: number;
}

export interface UseCouplePairsOptions {
  /** 按坐标取格子(来自编辑器的 grid). */
  cellAt: (y: number, x: number) => PairCell | undefined;
  /** 任何配对变动后调用, 把编辑器标成脏. */
  markDirty: () => void;
}

/**
 * 情侣对配对逻辑 —— 从 HallSeatEditor 抽出.
 *
 * 领域规则(与原编辑器一致, 不要在这里放松):
 *  - 情侣座只能由**标准座**配成: VIP/无障碍的 type 只有一个值,
 *    配对会把 type 同步成 2, 会造成"看着是 VIP、却要成对买"的自相矛盾.
 *  - 一对必须同排、左右相邻.
 *  - 配对按坐标而不是 seatId: 新增座位保存前没有 id.
 */
export function useCouplePairs({ cellAt, markDirty }: UseCouplePairsOptions) {
  /** 已配成情侣对的格子. key 是坐标对, 方便查. */
  const pairs = ref<CouplePair[]>([]);

  /** 正在等待配对的第一格. 点「配情侣对」后进入等待, 再点相邻一格完成. */
  const pairAnchor = ref<{ y: number; x: number } | null>(null);

  /** 该格属于哪一对(找到就返回 pair 的下标). */
  function pairIndexOf(y: number, x: number): number {
    return pairs.value.findIndex(
      (p) => (p.y1 === y && p.x1 === x) || (p.y2 === y && p.x2 === x),
    );
  }

  /** 一对里靠左那格(渲染时只有左边那格画合并样式). */
  function isPairLeft(y: number, x: number): boolean {
    const i = pairIndexOf(y, x);
    if (i < 0) return false;
    const p = pairs.value[i];
    return p.x1 <= p.x2 ? p.x1 === x && p.y1 === y : p.x2 === x && p.y2 === y;
  }

  /** 这一格所在的对跨几列(用于左半格 grid-column span). */
  function pairRange(y: number, x: number): number {
    const i = pairIndexOf(y, x);
    if (i < 0) return 1;
    const p = pairs.value[i];
    return Math.abs(p.x1 - p.x2) + 1;
  }

  /** 这一格是不是「被左侧那格合并掉了」, 渲染时直接跳过. */
  function isPairRight(y: number, x: number): boolean {
    const i = pairIndexOf(y, x);
    if (i < 0) return false;
    const p = pairs.value[i];
    const leftX = Math.min(p.x1, p.x2);
    return x === leftX + 1 && y === p.y1;
  }

  function assertPairable(y: number, x: number): boolean {
    const cell = cellAt(y, x);
    if (!cell || cell.status !== 1) {
      ElMessage.warning('情侣座要放在可售座位上');
      return false;
    }
    if (cell.type === 3 || cell.type === 4) {
      ElMessage.warning(`${seatTypeLabel(cell.type)}座不能配成情侣座, 请先用画笔涂成标准座`);
      return false;
    }
    return true;
  }

  /** 配情侣对: 点第一格进入等待, 再点同排相邻的一格完成配对; 点已配对的格子解绑. */
  function togglePair(y: number, x: number) {
    if (!assertPairable(y, x)) return;
    // 已经在某一对里 → 解绑
    const existing = pairIndexOf(y, x);
    if (existing >= 0) {
      pairs.value.splice(existing, 1);
      markDirty();
      pairAnchor.value = null;
      return;
    }
    if (!pairAnchor.value) {
      pairAnchor.value = { y, x };
      return;
    }
    const a = pairAnchor.value;
    if (a.y === y && a.x === x) {
      pairAnchor.value = null;
      return;
    }
    if (a.y !== y) {
      ElMessage.warning('情侣座必须同一排');
      return;
    }
    if (Math.abs(a.x - x) !== 1) {
      ElMessage.warning('情侣座必须左右相邻');
      return;
    }
    // 锚点是选中那一刻校验过的, 但中途可能被画笔改过(涂成 VIP / 过道), 所以再校一次
    if (!assertPairable(a.y, a.x)) {
      pairAnchor.value = null;
      return;
    }
    if (pairIndexOf(a.y, a.x) >= 0) {
      ElMessage.warning('那一格已经在别的情侣对里了');
      pairAnchor.value = null;
      return;
    }
    const leftX = Math.min(a.x, x);
    const rightX = Math.max(a.x, x);
    pairs.value.push({ y1: y, x1: leftX, y2: y, x2: rightX });
    pairAnchor.value = null;
    markDirty();
  }

  /** 解掉包含某格的对(涂成过道时调用, 避免留下半对). */
  function removePairsAt(y: number, x: number) {
    pairs.value = pairs.value.filter(
      (p) => !((p.y1 === y && p.x1 === x) || (p.y2 === y && p.x2 === x)),
    );
  }

  function clearPairs() {
    pairs.value = [];
    pairAnchor.value = null;
  }

  /**
   * 后端情侣对 → 坐标对. 需要调用方提供 seatId → 坐标 的反查
   * (编辑器从 grid 建, 建完 grid 再调这里).
   */
  function buildPairs(
    groups: Array<{ seatId1: number; seatId2: number }>,
    coordById: Map<number, { y: number; x: number }>,
  ) {
    const out: CouplePair[] = [];
    for (const g of groups) {
      const a = coordById.get(g.seatId1);
      const b = coordById.get(g.seatId2);
      if (a && b) out.push({ y1: a.y, x1: a.x, y2: b.y, x2: b.x });
    }
    pairs.value = out;
  }

  return {
    pairs,
    pairAnchor,
    pairIndexOf,
    isPairLeft,
    isPairRight,
    pairRange,
    togglePair,
    removePairsAt,
    clearPairs,
    buildPairs,
  };
}
