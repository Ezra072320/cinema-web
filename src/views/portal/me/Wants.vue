<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Star } from '@element-plus/icons-vue';
import { movieApi, userApi } from '@/api';
import type { MovieDetail } from '@/types';

const router = useRouter();

const list = ref<MovieDetail[]>([]);
const loading = ref(true);
const error = ref<unknown>(null);
const toggling = ref(new Set<number>());

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const ids = await userApi.wants();
    if (!ids.length) {
      list.value = [];
      return;
    }
    // TODO(后端): 期望提供 `GET /movie/wants/list` 批量接口,避免 N+1.
    const movies = await Promise.all(ids.map((id) => movieApi.info(id).catch(() => null)));
    list.value = movies.filter((m): m is MovieDetail => m !== null);
  } catch (err) {
    // toast 由 http 拦截器统一弹; 这里只记 error 渲染重试入口
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function toggle(m: MovieDetail) {
  if (toggling.value.has(m.id)) return;

  let ok: boolean;
  try {
    await ElMessageBox.confirm(
      `确定从想看清单移除《${m.title}》?`,
      '移除影片',
      { type: 'warning', confirmButtonText: '确认移除' },
    );
    ok = true;
  } catch {
    ok = false;
  }
  if (!ok) return;

  toggling.value.add(m.id);
  try {
    // 返回值 = 切换后状态; 本页只有「移除」一个动作, 列表按返回值同步(极端竞态下不糊弄)
    const next = await userApi.toggleWant(m.id);
    if (!next) {
      list.value = list.value.filter((x) => x.id !== m.id);
      ElMessage.success('已取消想看');
    }
  } catch {
    // 业务/网络错误由 http 拦截器统一弹 toast(D8)
  } finally {
    toggling.value.delete(m.id);
  }
}

function goMovie(id: number) {
  router.push({ name: 'movie-detail', params: { id } });
}

onMounted(load);
</script>

<template>
  <div class="wants">
    <header class="head">
      <div>
        <h1 class="title">想看清单</h1>
        <p class="subtitle">这些影片上映时,你会收到站内提醒</p>
      </div>
      <div class="head-meta">
        <el-icon><Star /></el-icon>
        <span>{{ list.length }} 部想看</span>
      </div>
    </header>

    <PageSkeleton v-if="loading" :rows="6" :show-header="false" />

    <ErrorState v-else-if="error" :error="error" @retry="load" />

    <EmptyState
      v-else-if="!list.length"
      title="还没有想看的影片"
      hint="在影片详情页点击「想看」即可加入"
    >
      <template #actions>
        <el-button type="primary" @click="router.push('/movie')">浏览影片</el-button>
      </template>
    </EmptyState>

    <div v-else class="grid">
      <article
        v-for="m in list"
        :key="m.id"
        class="want-card"
      >
        <div class="poster-area" @click="goMovie(m.id)">
          <MovieCard :movie="m" @click="goMovie(m.id)" />

          <button
            class="remove-btn"
            type="button"
            :disabled="toggling.has(m.id)"
            :aria-label="`移除《${m.title}》`"
            @click.stop="toggle(m)"
          >
            <span v-if="toggling.has(m.id)">…</span>
            <span v-else>×</span>
          </button>
        </div>

        <div class="meta-row">
          <span v-if="m.releaseDate" class="meta-pill">
            {{ new Date(m.releaseDate).getFullYear() || '—' }}
          </span>
          <span v-if="m.runtimeMin" class="meta-pill">{{ m.runtimeMin }} 分钟</span>
          <span v-if="(m.score ?? 0) > 0" class="meta-pill score">
            ★ {{ (m.score ?? 0).toFixed(1) }}
          </span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wants {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-5);
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cx-space-3);
}

.title {
  margin: 0 0 4px;
  font-size: 26px;
  font-weight: 700;
  color: var(--cx-text-primary);
  letter-spacing: -0.02em;
}

.subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--cx-text-muted);
}

.head-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cx-color-primary);
  padding: 4px 12px;
  border-radius: var(--cx-radius-full);
  background: color-mix(in srgb, var(--cx-color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--cx-color-primary) 32%, transparent);

  .el-icon { font-size: 12px; }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: var(--cx-space-5);
}

.want-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.poster-area {
  position: relative;
  border-radius: var(--cx-radius-md);
  overflow: hidden;

  /* MovieCard 自身已经是卡片, 这里只需要把它顶到容器顶层;
     移除按钮 absolute 定位到右上角, 通过 hover 让按钮显现. */
  :deep(.movie-card) {
    border-radius: var(--cx-radius-md);
  }

  /* 移除按钮默认只露一点点角标, hover 时整按钮显现. */
  .remove-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 20, 25, 0.85);
    backdrop-filter: blur(6px);
    border: 1px solid var(--cx-border-strong);
    border-radius: 50%;
    color: var(--cx-text-primary);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.85);
    transition:
      opacity var(--cx-duration-fast) var(--cx-ease),
      transform var(--cx-duration-fast) var(--cx-ease),
      background var(--cx-duration-fast) var(--cx-ease),
      color var(--cx-duration-fast) var(--cx-ease);
    z-index: 2;
  }

  /* 始终显示一个 "×" 角标, 让用户知道可移除, 完整按钮在 hover 时出现.
     角标默认必须可见(早先写成 opacity: 0, 且 hover 规则也是 0, 等于永远不显示). */
  &::after {
    content: '×';
    position: absolute;
    top: 8px;
    right: 8px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 20, 25, 0.7);
    backdrop-filter: blur(6px);
    border-radius: 50%;
    color: var(--cx-text-primary);
    font-size: 16px;
    line-height: 1;
    opacity: 1;
    transition: opacity var(--cx-duration-fast) var(--cx-ease);
    z-index: 1;
    pointer-events: none;
  }
  /* hover 时完整按钮出现, 角标让位 */
  &:hover::after { opacity: 0; }
}

/* 触屏没有 hover: 移除按钮常显, 否则触屏用户无从移除 */
@media (hover: none) {
  .poster-area {
    &::after { display: none; }

    .remove-btn {
      opacity: 1;
      transform: scale(1);
    }
  }
}

.poster-area:hover .remove-btn {
  opacity: 1;
  transform: scale(1);

  &:hover {
    background: var(--cx-danger);
    border-color: var(--cx-danger);
    color: #fff;
  }
}

.remove-btn:focus-visible {
  opacity: 1;
  transform: scale(1);
  outline: 2px solid var(--cx-color-primary);
  outline-offset: 2px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--cx-radius-full);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--cx-border);
  color: var(--cx-text-secondary);
  letter-spacing: 0.02em;

  &.score {
    color: var(--cx-color-primary);
    background: color-mix(in srgb, var(--cx-color-primary) 10%, transparent);
    border-color: color-mix(in srgb, var(--cx-color-primary) 28%, transparent);
  }
}
</style>