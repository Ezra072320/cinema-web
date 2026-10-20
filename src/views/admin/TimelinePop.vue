<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { HALL_COL_WIDTH, type Block } from '@/composables/useTimelineDrag';

/**
 * 排片操作弹层: 编辑 / 取消场次 / 删除.
 *
 * 定位: x/y 来自父组件的**轨道内容坐标系**(不含左侧影厅列, 跟随横向滚动),
 * 这里统一加 HALL_COL_WIDTH 偏移到 .timeline 坐标系.
 * ⚠️ HALL_COL_WIDTH 与 ScheduleTimeline 影厅列宽同源(useTimelineDrag 里的常量),
 * 两边不许各自写死 150, 否则弹层与列错位.
 */
defineProps<{ block: Block; x: number; y: number }>();
const emit = defineEmits<{
  close: [];
  action: [kind: 'edit' | 'cancel' | 'remove'];
}>();

function statusLabel(b: Block): string {
  if (b.canceled) return '已取消';
  if (b.started) return '已开场';
  return '待放映';
}

// ESC 关闭: 组件由 v-if 控制, 挂载即打开 —— 打开时注册, 卸载(关闭)时移除.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    class="pop"
    role="dialog"
    aria-label="场次操作"
    :style="{ left: `${x + HALL_COL_WIDTH}px`, top: `${y + 8}px` }"
    @pointerdown.stop
  >
    <div class="pop-head">
      <strong>{{ block.row.movieName ?? `#${block.row.movieId}` }}</strong>
      <el-tag size="small" :type="block.canceled ? 'danger' : block.started ? 'info' : 'success'">
        {{ statusLabel(block) }}
      </el-tag>
    </div>
    <p class="pop-meta">
      {{ block.row.hallName }} · {{ block.row.startTime.slice(5, 16) }} 开映 ·
      ¥{{ block.row.price }}
    </p>
    <div class="pop-actions">
      <el-button v-if="!block.canceled && !block.started" size="small" @click="emit('action', 'edit')">
        编辑
      </el-button>
      <el-button v-if="!block.canceled" size="small" type="warning" @click="emit('action', 'cancel')">
        取消场次
      </el-button>
      <el-button v-if="!block.started" size="small" type="danger" @click="emit('action', 'remove')">
        删除
      </el-button>
      <el-button size="small" text @click="emit('close')">关闭</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pop {
  position: absolute;
  z-index: 10;
  width: 260px;
  background: var(--cx-bg-elevated);
  border: 1px solid var(--cx-border-strong);
  border-radius: var(--cx-radius-md);
  box-shadow: var(--cx-shadow-lg);
  padding: var(--cx-space-3);

  .pop-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    strong {
      font-size: 14px;
    }
  }
  .pop-meta {
    font-size: 12px;
    color: var(--cx-text-secondary);
    margin: 6px 0 10px;
  }
  .pop-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
}
</style>
