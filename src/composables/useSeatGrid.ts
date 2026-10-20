import { computed, type ComputedRef, type Ref } from 'vue';

/** 座位在网格里需要的最小信息. */
export interface GridSeat {
  /** 座位 id. 注意不是 ticketId —— 那两个是不同的 id 空间. */
  seatId: number;
  x: number;
  y: number;
  /** 0 不可用(过道) / 1 正常. 编号时要靠它把过道排除掉. */
  status?: number;
}

/** 一对情侣座. */
export interface CouplePair {
  seatId1: number;
  seatId2: number;
}

/**
 * 座位网格的**情侣对几何**: 哪一格被合并掉了、合并后要跨几列、每一格落在哪.
 *
 * 为什么抽出来: 这套逻辑(左半格 `grid-column: span 2` + 右半格整格不渲染)在
 * 座位图编辑器、影厅预览、选座页都要用. 之前是各写各的, 于是"无障碍座位"只在其中
 * 一份里加了样式, 另外两份漏掉; 情侣对的合并也一度只在选座页对、预览页完全没做.
 * **同一个几何只留一份实现**, 三个页面就不会各自漂移.
 *
 * ⚠️ 两个必须遵守的渲染约定(踩过坑, 见 README 第十一节):
 *   1. `isRightHalf` 为 true 的格子要**整个不渲染**, 不能渲染成空占位元素 ——
 *      占位元素本身是 grid item, 会实打实占掉一格, 把整排挤歪;
 *   2. 每一格都要显式写 `grid-row` / `grid-column`(用 {@link cellStyle}),
 *      不要依赖自动排布 —— 自动排布遇到 span 会顺延, 整排跟着漂.
 *
 * 座位图编辑器**不用这个 composable**: 它维护的是"还没保存的本地配对"(用户点两格
 * 就变, 后端还不知道), 生命周期和这里的"后端下发的已保存情侣对"不是一回事.
 * 但它的渲染约定跟这里一致, 改的时候两边要一起改.
 */
export function useSeatGrid<T extends GridSeat>(
  seats: Ref<T[] | undefined> | ComputedRef<T[] | undefined>,
  coupleGroups: Ref<CouplePair[] | undefined> | ComputedRef<CouplePair[] | undefined>,
) {
  const list = computed<T[]>(() => seats.value ?? []);
  const groups = computed<CouplePair[]>(() => coupleGroups.value ?? []);

  /** `${x}-${y}` -> 座位, 供模板 O(1) 取. */
  const seatMap = computed(() => {
    const m = new Map<string, T>();
    for (const s of list.value) m.set(`${s.x}-${s.y}`, s);
    return m;
  });

  const byId = computed(() => {
    const m = new Map<number, T>();
    for (const s of list.value) m.set(s.seatId, s);
    return m;
  });

  function seatAt(x: number, y: number): T | undefined {
    return seatMap.value.get(`${x}-${y}`);
  }

  function seatById(seatId: number): T | undefined {
    return byId.value.get(seatId);
  }

  /** seatId → 同一对里的另一个 seatId. */
  const pairPartner = computed(() => {
    const m = new Map<number, number>();
    for (const g of groups.value) {
      m.set(g.seatId1, g.seatId2);
      m.set(g.seatId2, g.seatId1);
    }
    return m;
  });

  /** seatId → 所属情侣对的序号; 不在任何对里则没有. */
  const pairIndexOf = computed(() => {
    const m = new Map<number, number>();
    groups.value.forEach((g, i) => {
      m.set(g.seatId1, i);
      m.set(g.seatId2, i);
    });
    return m;
  });

  function isCouple(seatId: number | undefined): boolean {
    return seatId != null && pairIndexOf.value.has(seatId);
  }

  /**
   * 一对里靠左那半的 seatId. 只有它渲染成横跨两列的合并格.
   * 按 x 比大小, 不假设 seatId1 一定在左边.
   */
  const leftSeatId = computed(() => {
    const m = new Map<number, number>();
    for (const g of groups.value) {
      const a = seatById(g.seatId1);
      const b = seatById(g.seatId2);
      if (!a || !b) continue;
      m.set(g.seatId1, a.x <= b.x ? g.seatId1 : g.seatId2);
      m.set(g.seatId2, a.x <= b.x ? g.seatId1 : g.seatId2);
    }
    return m;
  });

  /** 该座位是不是"被左半格合并掉"的右半格 —— 渲染时整个格子跳过. */
  function isRightHalf(seatId: number | undefined): boolean {
    if (seatId == null) return false;
    const left = leftSeatId.value.get(seatId);
    return left != null && left !== seatId;
  }

  /** 该座位是不是那一对里靠左的半格(要横跨两列). */
  function isLeftHalf(seatId: number | undefined): boolean {
    if (seatId == null) return false;
    return leftSeatId.value.get(seatId) === seatId;
  }

  /** 合并格要横跨几列. 后端强制相邻所以恒为 2; 按实际坐标算只为防历史脏数据. */
  function spanOf(seatId: number | undefined): number {
    if (seatId == null) return 1;
    const p = pairPartner.value.get(seatId);
    if (p == null) return 1;
    const a = seatById(seatId);
    const b = seatById(p);
    if (!a || !b) return 1;
    return Math.abs(a.x - b.x) + 1;
  }

  /**
   * 该格的网格位置.
   *
   * 列号 **+1**: 网格第一列留给排号, 座位 x 落在 grid 的第 x+1 列.
   */
  function cellStyle(seat: T): Record<string, string | number> {
    return isLeftHalf(seat.seatId)
      ? { gridColumn: `${seat.x + 1} / span ${spanOf(seat.seatId)}`, gridRow: seat.y }
      : { gridColumn: seat.x + 1, gridRow: seat.y };
  }

  /** 排号那一格的网格位置(第 1 列). */
  function rowLabelStyle(y: number): Record<string, number> {
    return { gridColumn: 1, gridRow: y };
  }

  /**
   * 每个座位的**座位号**: 本排内从 1 数起, 按"看得见的一格"编号.
   *
   * 跟 `(y, x)` 物理坐标是两回事, 有三条规则:
   *
   *  1. **过道不占号** —— 画图时为了留过道, 一行里 x 可能是 1,2,4,5,
   *     但观众看到的应该是 1,2,3,4;
   *  2. **一对情侣座只占一个号** —— 两个物理座位合并成了一个格子,
   *     再给它俩各编一个号就会在中间留个看不见的空号
   *     (3-1 情侣、3-3 VIP, 中间的 3-2 谁也不显示);
   *  3. 整排都是过道的行, 那一排也不占排号.
   */
  const seatNoById = computed(() => {
    const m = new Map<number, number>();
    const byRow = new Map<number, T[]>();
    for (const s of list.value) {
      if (s.status !== undefined && s.status !== 1) continue; // 过道不算座位
      const arr = byRow.get(s.y);
      if (arr) arr.push(s);
      else byRow.set(s.y, [s]);
    }
    for (const arr of byRow.values()) {
      arr.sort((a, b) => a.x - b.x);
      const countedPair = new Set<number>();
      let no = 0;
      for (const s of arr) {
        const pairIdx = pairIndexOf.value.get(s.seatId);
        if (pairIdx != null) {
          // 一对只数一次: 靠左那半递增号, 另一半复用同一个号
          if (countedPair.has(pairIdx)) {
            m.set(s.seatId, no);
            continue;
          }
          countedPair.add(pairIdx);
        }
        no += 1;
        m.set(s.seatId, no);
      }
    }
    return m;
  });

  /**
   * 有座位的排号, 从 1 开始连续编号.
   * 整排都是过道的话这一排不占号(否则预览页会出现 1,2,4,5 这种断号).
   */
  const rowNos = computed(() => {
    const ys = new Set<number>();
    for (const s of list.value) {
      if (s.status !== undefined && s.status !== 1) continue;
      ys.add(s.y);
    }
    const m = new Map<number, number>();
    [...ys].sort((a, b) => a - b).forEach((y, i) => m.set(y, i + 1));
    return m;
  });

  /** 座位号的显示串, 如 `3-5` (第 3 排第 5 号). */
  function seatNumber(y: number, seatId: number): string {
    return `${rowNos.value.get(y) ?? y}-${seatNoById.value.get(seatId) ?? '?'}`;
  }

  return {
    seatMap,
    seatAt,
    seatById,
    pairPartner,
    isCouple,
    isRightHalf,
    isLeftHalf,
    spanOf,
    cellStyle,
    rowLabelStyle,
    seatNoById,
    rowNos,
    seatNumber,
  };
}
