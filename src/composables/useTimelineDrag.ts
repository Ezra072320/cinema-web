import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { scheduleApi } from '@/api';
import type { Schedule } from '@/types';

/**
 * 排片时间轴的**几何常量 + 拖拽交互**.
 *
 * 为什么几何常量也集中在这里: 横轴刻度、场次块定位、拖拽换算、弹层偏移用的是
 * 同一套比例(24h × 2px/分钟). 早先 CSS 写死 2160px(18h) 而 JS 常量是 2880px,
 * 18 点后刻度出轨 —— 同一套几何只留一份定义, 模板与逻辑才不会各自漂移.
 */

// ===== 几何常量 =====
// 横轴是完整 24 小时(00:00–24:00), 与自然日一致; 跨午夜场次在右缘截断, 次日段落到次日视图.
export const DAY_START_MIN = 0;
export const DAY_END_MIN = 24 * 60;
export const SPAN_MIN = DAY_END_MIN - DAY_START_MIN; // 1440
export const PX_PER_MIN = 2;
export const TRACK_WIDTH = SPAN_MIN * PX_PER_MIN; // 2880
export const ROW_HEIGHT = 64;
export const HEADER_HEIGHT = 34;
export const SNAP_MIN = 5;
export const CLICK_TOLERANCE_PX = 4;
/**
 * 左侧影厅列宽. ⚠️ 三处同源到本常量, 不许各自写死:
 * ScheduleTimeline 的 .hall-col 内联 flex、TimelinePop 的定位偏移.
 */
export const HALL_COL_WIDTH = 150;

/** 时间轴上的一场排片(渲染用视图模型), 由 ScheduleTimeline 的 blocksByHall 构造. */
export interface Block {
  row: Schedule;
  left: number;
  width: number;
  color: string;
  canceled: boolean;
  started: boolean;
  draggable: boolean;
  timeText: string;
}

// ===== 时间换算(全部字符串切片, 不 new Date 解析 —— 时区坑已踩过) =====

export function axisMinToClock(axisMin: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(axisMin / 60))}:${pad(axisMin % 60)}`;
}

export function snap(v: number): number {
  return Math.round(v / SNAP_MIN) * SNAP_MIN;
}

interface DragState {
  block: Block;
  startClientX: number;
  originLeft: number;
  curLeft: number;
  moved: boolean;
}

/**
 * 场次块拖拽: 状态(drag/dragHint) + window 级指针事件 + 松手改期(单场/整批).
 * 弹层开闭与数据重载由调用方注入 —— composable 不拥有 pop 和 schedules.
 */
export function useTimelineDrag(opts: {
  viewDate: Ref<string> | ComputedRef<string>;
  openPop: (b: Block) => void;
  closePop: () => void;
  reload: () => Promise<void>;
}) {
  const { viewDate, openPop, closePop, reload } = opts;
  const drag = ref<DragState | null>(null);
  let dragCleanup: (() => void) | null = null;

  /**
   * 拖拽监听挂在 window 上 —— 早先挂在色块上的写法有个死因:
   * 指针(尤其从窄块边缘/斜着)移出色块后, pointermove 就不再到达该块, 拖拽直接断掉.
   * window 监听 + 按 id 匹配, 指针在哪都能继续拖.
   */
  function onBlockDown(b: Block, e: PointerEvent) {
    e.stopPropagation();
    if (!b.draggable) {
      // 不可拖的块也能点开看信息
      openPop(b);
      return;
    }
    e.preventDefault();
    drag.value = { block: b, startClientX: e.clientX, originLeft: b.left, curLeft: b.left, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 捕获失败也无妨, window 监听兜底 */
    }
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
    window.addEventListener('pointercancel', onWinUp);
    dragCleanup = () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      window.removeEventListener('pointercancel', onWinUp);
      dragCleanup = null;
    };
    closePop();
  }

  function onWinMove(e: PointerEvent) {
    const d = drag.value;
    if (!d) return;
    const dx = e.clientX - d.startClientX;
    if (Math.abs(dx) > CLICK_TOLERANCE_PX) d.moved = true;
    if (d.moved) {
      d.curLeft = Math.max(0, Math.min(TRACK_WIDTH - d.block.width, d.originLeft + dx));
    }
  }

  async function onWinUp() {
    const d = drag.value;
    drag.value = null;
    dragCleanup?.();
    if (!d) return;
    if (!d.moved) {
      // 位移不足视为点击 —— 弹出操作层
      openPop(d.block);
      return;
    }
    const newAxisMin = snap(d.curLeft / PX_PER_MIN);
    const oldAxisMin = snap(d.originLeft / PX_PER_MIN);
    if (newAxisMin === oldAxisMin) return;
    const newTime = axisMinToClock(newAxisMin);
    const s = d.block.row;
    try {
      if (s.batchId) {
        const done = await tryBatchMove(s, newTime);
        if (done) return; // 走完批量分支(或用户取消), 不再走单场
      }
      await scheduleApi.update({ id: s.id, movieId: s.movieId, startTime: `${viewDate.value}T${newTime}:00` });
      ElMessage.success(`已改期到 ${newTime}`);
    } catch (err) {
      ElMessage.error((err as { msg?: string })?.msg ?? '改期失败');
    } finally {
      // 无论成败都重载 —— 失败即弹回原位(数据没变)
      await reload();
    }
  }

  /**
   * 批量场次的改期确认. 返回 true 表示已处理完(整批改/用户取消), false 表示落回单场路径.
   * 「整批」= 同批次同时段整体改时刻(每场保留自己的日期), 与批量排片同口径: 冲突/过期的跳过并报告.
   */
  async function tryBatchMove(s: Schedule, newTime: string): Promise<boolean> {
    // 同时段不足 2 场时没什么可"整批"的 —— 直接单场
    const info = await scheduleApi.batchInfo(s.batchId!, s.startTime.slice(11, 16));
    if (!info || info.movable <= 1) return false;

    let choice: 'batch' | 'single' | 'abort';
    try {
      await ElMessageBox.confirm(
        `《${s.movieName ?? `#${s.movieId}`}》 ${s.startTime.slice(11, 16)} → ${newTime} 属于批量排片，同时段共 ${info.movable} 场。要一起改时刻吗？`,
        '批量改期确认',
        {
          type: 'warning',
          distinguishCancelAndClose: true,
          confirmButtonText: `整批改（${info.movable} 场）`,
          cancelButtonText: '只改这一天',
        },
      );
      choice = 'batch';
    } catch (action) {
      // distinguishCancelAndClose: cancel='只改这一天', close/ESC='取消拖拽'
      choice = action === 'cancel' ? 'single' : 'abort';
    }

    if (choice === 'abort') return true; // 取消拖拽, 不改任何场次
    if (choice === 'single') return false; // 落回单场 update

    const r = await scheduleApi.batchMove({
      batchId: s.batchId!,
      // 后端按 ISO 解析 LocalDateTime, 不能发 "yyyy-MM-dd HH:mm:ss"
      sourceStartTime: `${s.startTime.slice(0, 10)}T${s.startTime.slice(11, 16)}:00`,
      targetStartTime: `${viewDate.value}T${newTime}:00`,
    });
    const moved = r.created.length;
    const skipped = r.skipped.length;
    if (skipped > 0) {
      ElMessage.warning(`整批改期成功 ${moved} 场，跳过 ${skipped} 场`);
      await ElMessageBox.alert(
        r.skipped.map((x) => `${x.startTime.slice(5, 16)}：${x.reason}`).join('\n'),
        '被跳过的场次',
      );
    } else {
      ElMessage.success(`整批改期成功 ${moved} 场`);
    }
    return true;
  }

  /** 拖拽中显示的目标时间浮签. */
  const dragHint = computed(() => {
    const d = drag.value;
    if (!d || !d.moved) return null;
    return {
      left: d.curLeft,
      hallId: d.block.row.hallId,
      text: axisMinToClock(snap(d.curLeft / PX_PER_MIN)),
    };
  });

  return { drag, dragHint, onBlockDown };
}
