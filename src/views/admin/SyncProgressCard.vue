<script setup lang="ts">
import { computed } from 'vue';
import type { MovieSyncStatus } from '@/types';

/**
 * 同步 / 补缺进度卡（进度条 + 失败与待补明细）。
 * 从 MovieManage 拆出：只读展示进度快照并转发"核实补录"入口；
 * 起停、轮询与完成提示仍在父级 —— 进度数据随 prop 响应式更新。
 */
const props = defineProps<{ sync: MovieSyncStatus | null; syncing: boolean }>();
const emit = defineEmits<{ edit: [movieId: number] }>();

const syncPercent = computed(() => {
  const s = props.sync;
  if (!s || !s.total) return 0;
  return Math.min(100, Math.round((s.done / s.total) * 100));
});

const incompleteItems = computed(() => (props.sync?.results ?? []).filter((r) => r.ok && r.missingFields?.length));
const failedItems = computed(() => (props.sync?.results ?? []).filter((r) => !r.ok));
</script>

<template>
  <el-card v-if="sync && (syncing || sync.finishedAt)" class="sync-card cx-glass" shadow="never">
    <div class="sync-head">
      <span class="sync-label">
        {{ sync.mode === 'REPAIR' ? (syncing ? '正在补缺' : '上次补缺') : (syncing ? '正在同步' : '上次同步') }}
        <template v-if="syncing && sync.current">· 当前：{{ sync.current }}</template>
      </span>
      <span class="sync-count">
        <template v-if="sync.mode === 'REPAIR'">补充 {{ sync.updated }} · 暂无新增资料 {{ sync.skipped }}</template>
        <template v-else>新增 {{ sync.created }} · 已存在跳过 {{ sync.skipped }}</template>
        · 待补 {{ sync.partial }} · 失败 {{ sync.fail }} · {{ sync.done }}/{{ sync.total }}
      </span>
    </div>

    <p :class="{ 'sync-error': sync.state === 'FAILED' }" role="status">{{ sync.message }}</p>
    <el-progress
      :percentage="syncPercent"
      :status="sync.state === 'FAILED' ? 'exception' : !syncing && (sync.fail > 0 || sync.partial > 0) ? 'warning' : undefined"
      :stroke-width="10"
    />

    <div v-if="failedItems.length" class="sync-fails">
      <p class="sync-fails-title">以下影片未能更新（已有资料保持不变，可再次点击重试）：</p>
      <ul>
        <li v-for="f in failedItems" :key="f.title">
          <strong>{{ f.title }}</strong> — {{ f.message }}
          <el-button v-if="f.movieId" link type="primary" @click="emit('edit', f.movieId)">核实补录</el-button>
        </li>
      </ul>
    </div>
    <details v-if="incompleteItems.length" class="sync-fails">
      <summary>查看 {{ incompleteItems.length }} 部资料待补影片</summary>
      <ul><li v-for="item in incompleteItems" :key="item.title">{{ item.title }}：{{ item.missingFields?.join('、') }}
        <el-button v-if="item.movieId" link type="primary" @click="emit('edit', item.movieId)">核实补录</el-button>
      </li></ul>
    </details>
  </el-card>
</template>

<style scoped lang="scss">
.sync-error { color: var(--cx-danger); }

.sync-card {
  padding: var(--cx-space-3) var(--cx-space-4);
}

.sync-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--cx-space-3);
  font-size: 13px;
}

.sync-label { color: var(--cx-text-secondary); }
.sync-count { color: var(--cx-text-muted); }

.sync-fails {
  margin-top: var(--cx-space-3);
  font-size: 12px;
  color: var(--cx-text-muted);

  &-title { margin: 0 0 6px; }
  ul { margin: 0; padding-left: 18px; }
  li { line-height: 1.7; }
  strong { color: var(--cx-text-secondary); }
}
</style>
