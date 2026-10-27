<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { searchApi } from '@/api/search';

const state = ref('');
const busy = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
async function refresh() {
  try {
    const info = await searchApi.status();
    if (disposed) return;
    state.value = info.building_index
      ? info.last_error
        ? '搜索资料更新暂缓，正在重试'
        : '搜索资料正在更新，完成后自动切换'
      : info.active_index
        ? '搜索资料已就绪'
        : '搜索资料准备中';
    busy.value = Boolean(info.building_index);
    if (busy.value) timer = setTimeout(refresh, 3000);
  } catch {
    if (!disposed) state.value = '搜索服务未启动';
  }
}
async function rebuild() {
  busy.value = true;
  try {
    await searchApi.rebuild();
    ElMessage.success('已开始重建搜索资料，当前检索仍可使用');
    await refresh();
  } catch {
    busy.value = false;
  }
}
onMounted(refresh);
onUnmounted(() => {
  disposed = true;
  clearTimeout(timer);
});
</script>

<template>
  <div class="search-index cx-glass">
    <div>
      <strong>影片搜索</strong><span>{{ state }}</span>
    </div>
    <el-button :loading="busy" size="small" @click="rebuild">重建搜索资料</el-button>
  </div>
</template>

<style scoped lang="scss">
.search-index {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-radius: var(--cx-radius-lg);
}
.search-index div {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.search-index strong {
  font-size: 14px;
}
.search-index span {
  font-size: 12px;
  color: var(--cx-text-muted);
}
</style>
