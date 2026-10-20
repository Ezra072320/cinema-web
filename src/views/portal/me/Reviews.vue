<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { reviewApi } from '@/api';
import ReviewCard from '@/components/ReviewCard.vue';
import { confirmAction } from '@/composables/useConfirm';
import { useAsyncData } from '@/composables/useAsyncData';
import type { ReviewView } from '@/types';
const router = useRouter();
const page = ref(1);
const deleting = ref<number | null>(null);
// 竞态保护/错误态/loading 在 useAsyncData; fetcher 内含"当前页越界则钳回末页"的二次请求
const { data, loading, error, load } = useAsyncData(async () => {
  let result = await reviewApi.mine(page.value);
  if (!result.rows.length && result.total > 0 && page.value > 1) {
    page.value = Math.max(1, Math.ceil(result.total / 10));
    result = await reviewApi.mine(page.value);
  }
  return result;
});
const rows = computed<ReviewView[]>(() => data.value?.rows ?? []);
const total = computed(() => data.value?.total ?? 0);
function changePage(value: number) { page.value = value; load(); }
async function remove(review: ReviewView) {
  if (!review.orderId || !review.version || deleting.value) return;
  const ok = await confirmAction('删除后，此评分和短评将从影片页移除。符合评价条件时可以重新发表。', '删除评价？',
    { confirmButtonText: '删除评价', cancelButtonText: '保留' });
  if (!ok) return;
  deleting.value = review.id;
  try { await reviewApi.remove(review.orderId, review.version); ElMessage.success('评价已删除'); await load(); }
  catch { /* API拦截器展示错误 */ }
  finally { deleting.value = null; }
}
</script>
<template>
  <div class="my-reviews"><header class="reviews-heading"><div><span class="eyebrow">MY FILM JOURNAL</span><h1>我的评价 <small>{{ total }} 条</small></h1><p>记录散场后的感受，也可以重新审视自己的评分。</p></div><el-button text :icon="Refresh" :disabled="!!deleting" @click="load">刷新</el-button></header>
    <PageSkeleton v-if="loading" :rows="3" :show-header="false" /><ErrorState v-else-if="error" :error="error" @retry="load" />
    <EmptyState v-else-if="!rows.length" title="你的观影手记还空着" hint="电影放映结束后，可以从订单发表评分和短评。"><template #actions><el-button type="primary" @click="router.push('/me/orders/5')">查看我的订单</el-button></template></EmptyState>
    <div v-else class="review-list"><ReviewCard v-for="review in rows" :key="review.id" :review="review" show-movie :deleting="deleting === review.id" @remove="remove" /></div>
    <el-pagination v-if="total > 10 && !error" :current-page="page" :page-size="10" :total="total" layout="prev, pager, next" @current-change="changePage" />
  </div>
</template>
<style scoped lang="scss">
.my-reviews { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.reviews-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; h1 { font-size: 27px; font-weight: 500; margin: 8px 0; small { color: var(--cx-text-muted); font-size: 12px; margin-left: 8px; } } p { margin: 0; font-size: 12px; line-height: 1.8; color: var(--cx-text-secondary); } }
.eyebrow { color: var(--cx-color-primary); font-size: 9px; letter-spacing: 2px; }
.review-list { display: flex; flex-direction: column; gap: 14px; }
.el-pagination { align-self: center; }
</style>
