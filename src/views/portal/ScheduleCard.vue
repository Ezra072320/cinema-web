<script setup lang="ts">
/**
 * 排片卡片 —— 影厅排期页单张场次卡(海报/片名/时间/价格).
 *
 * props:
 *  - schedule: 场次
 *  - index   : 在当前列表中的序号, 驱动入场错峰(--i)
 *
 * 整卡可点(含键盘), 跳转目标固定是本场次的选座页 ——
 * 路由在卡内处理, 父组件不必再分发跳转.
 */
import { useRouter } from 'vue-router';
import { Calendar } from '@element-plus/icons-vue';
import type { Schedule } from '@/types';
import { formatStartTime, formatEndTime } from '@/utils/datetime';

const props = withDefaults(defineProps<{ schedule: Schedule; index?: number }>(), { index: 0 });

const router = useRouter();

function goSchedule() {
  router.push({ name: 'seats', params: { scheduleId: props.schedule.id } });
}
</script>

<template>
  <article
    class="schedule-card cx-card"
    :class="{ 'no-poster': !schedule.poster }"
    :style="{ '--i': index }"
    role="button"
    tabindex="0"
    @click="goSchedule"
    @keydown.enter="goSchedule"
    @keydown.space.prevent="goSchedule"
  >
    <img
      v-if="schedule.poster"
      :src="schedule.poster"
      :alt="schedule.movieName ?? ''"
      class="poster"
      loading="lazy"
    />
    <div class="body">
      <div class="title-row">
        <h4 class="t">{{ schedule.movieName ?? `场次 ${schedule.id}` }}</h4>
        <span class="price">¥{{ schedule.price }}</span>
      </div>
      <div class="time">
        <el-icon><Calendar /></el-icon>
        <span class="start">{{ formatStartTime(schedule.startTime) }}</span>
        <span class="end">{{ formatEndTime(schedule.startTime, schedule.endTime) }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.schedule-card {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: var(--cx-space-3);
  padding: var(--cx-space-3);
  cursor: pointer;
  outline: none;

  /* 没有海报时单列, 不留 60px 空位 */
  &.no-poster {
    grid-template-columns: 1fr;
  }

  &:hover {
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid var(--cx-color-primary);
    outline-offset: 2px;
  }

  .poster {
    width: 60px;
    height: 80px;
    object-fit: cover;
    border-radius: var(--cx-radius-sm);
    background: rgba(255, 255, 255, 0.04);
  }

  .body {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
  }

  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;

    .t {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--cx-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .price {
      color: var(--cx-color-primary);
      font-weight: 700;
      font-size: 16px;
      flex-shrink: 0;
    }
  }

  .time {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    color: var(--cx-text-secondary);
    font-size: 12px;

    /* 窄卡片里整段换行, 不把"今天"和"19:00"拆开 */
    .start {
      white-space: nowrap;
    }

    .end {
      margin-left: 8px;
      color: var(--cx-text-muted);
      white-space: nowrap;

      &::before {
        content: '·';
        margin-right: 8px;
      }
    }
  }
}

/* ===== 筛选切换动效 =====
   TransitionGroup: 只做入场 + move, 不做 leave(grid 离场占位会跳格).
   --i 错峰最多叠 8 张, 卡片多也不拖沓. */
.sched-enter-active {
  transition:
    opacity var(--cx-duration-base) var(--cx-ease-out),
    transform var(--cx-duration-base) var(--cx-ease-out);
  transition-delay: calc(min(var(--i, 0), 8) * 30ms);
}

.sched-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.sched-move {
  transition: transform var(--cx-duration-base) var(--cx-ease-out);
}

/* 无障碍: 系统要求减少动态效果时全部关掉(同 HallManage 的开关) */
@media (prefers-reduced-motion: reduce) {
  .sched-enter-active,
  .sched-move {
    animation: none;
    transition: none;
  }

  .schedule-card:hover {
    transform: none;
  }
}
</style>
