<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Refresh } from '@element-plus/icons-vue';
import { reviewApi } from '@/api';
import ReviewCard from '@/components/ReviewCard.vue';
import { useAsyncData } from '@/composables/useAsyncData';
const props = defineProps<{ movieId: number }>();
const router = useRouter();
const page = ref(1);
const sort = ref('newest');
// 竞态保护/错误态在 useAsyncData; immediate:false, 由下面的 watch 触发(参数变化也要重载)
const { data: result, loading, error, load } = useAsyncData(
  () => reviewApi.movie(props.movieId, page.value, sort.value),
  { immediate: false },
);
const average = computed(() => result.value?.summary.average == null ? '—' : result.value.summary.average.toFixed(1));
function changeSort() { page.value = 1; load(); }
function changePage(value: number) { page.value = value; load(); }
watch(() => props.movieId, () => { page.value = 1; load(); }, { immediate: true });
</script>
<template>
  <section class="movie-reviews" aria-labelledby="reviews-title"><header class="section-heading"><div><span class="eyebrow">VOICES FROM THIS CINEMA</span><h2 id="reviews-title">本店观众评价</h2><p>仅统计有效购票订单在电影放映结束后的评价，满分 5 分。</p></div><el-button text :icon="Refresh" :disabled="loading" @click="load">刷新</el-button></header>
    <PageSkeleton v-if="loading && !result" :rows="2" :show-header="false" /><ErrorState v-else-if="error" :error="error" @retry="load" />
    <template v-else-if="result"><div class="review-summary cx-card"><div class="average"><strong>{{ average }}</strong><span>/ 5</span><small>{{ result.summary.count ? result.summary.count + ' 条真实购票评价' : '暂无本店观众评分' }}</small></div><div class="distribution"><div v-for="star in [5,4,3,2,1]" :key="star"><span>{{ star }} 分</span><i><b :style="{ width: result.summary.count ? ((result.summary.distribution[star] || 0) / result.summary.count * 100) + '%' : '0%' }" /></i><small>{{ result.summary.distribution[star] || 0 }}</small></div></div><div class="review-invite"><p>你的观影体验，也值得被看见。</p><el-button type="primary" plain @click="router.push('/me/orders/5')">从我的订单写评价</el-button></div></div>
      <div class="review-toolbar"><span>{{ result.total }} 条短评与评分</span><el-select v-model="sort" aria-label="评价排序" :disabled="loading" @change="changeSort"><el-option label="最近发表或更新" value="newest" /><el-option label="评分从高到低" value="highest" /><el-option label="评分从低到高" value="lowest" /></el-select></div>
      <div v-loading="loading" class="review-rows"><ReviewCard v-for="review in result.rows" :key="review.id" :review="review" /><EmptyState v-if="!result.rows.length" title="还没有观众留下评价" hint="看完电影后，欢迎分享你的感受。" /></div>
      <el-pagination v-if="result.total > 10" :current-page="page" :page-size="10" :total="result.total" layout="prev, pager, next" @current-change="changePage" />
    </template>
  </section>
</template>
<style scoped lang="scss">
.movie-reviews { margin-top: 55px; padding-top: 35px; border-top: 1px solid var(--cx-border); padding-bottom: 25px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 22px; h2 { font-size: 25px; font-weight: 500; margin: var(--cx-space-2) 0; } p { font-size: 12px; color: var(--cx-text-muted); line-height: 1.8; margin: 0; } }
.eyebrow { color: var(--cx-color-primary); font-size: 9px; letter-spacing: 2px; }
.review-summary { display: grid; grid-template-columns: 180px minmax(160px,1fr) 250px; gap: 35px; align-items: center; padding: 25px 30px; }
.average { strong { font-size: 48px; font-family: Georgia, serif; font-weight: 400; color: var(--cx-color-primary); } > span { color: var(--cx-text-muted); margin-left: 5px; font-size: 13px; } small { display: block; color: var(--cx-text-secondary); font-size: 11px; margin-top: 7px; } }
.distribution > div { display: flex; align-items: center; gap: 10px; margin: 7px 0; font-size: 10px; color: var(--cx-text-muted); > span { width: var(--cx-space-6); flex: none; } i { flex: 1; height: 5px; border-radius: 4px; overflow: hidden; background: rgba(255,255,255,.05); b { display: block; height: 100%; background: var(--cx-color-primary); } } small { width: 25px; text-align: right; } }
.review-invite { border-left: 1px solid var(--cx-border); padding-left: 25px; p { font-size: 12px; color: var(--cx-text-secondary); } .el-button { font-size: 12px; } }
.review-toolbar { margin: 22px 0 13px; display: flex; align-items: center; justify-content: space-between; gap: var(--cx-space-3); > span { font-size: 12px; color: var(--cx-text-muted); } .el-select { width: 165px; } }
.review-rows { display: flex; flex-direction: column; gap: var(--cx-space-3); min-height: 100px; }
.el-pagination { justify-content: center; margin-top: 22px; }
@media(max-width: 900px) { .review-summary { grid-template-columns: 140px minmax(0,1fr); gap: var(--cx-space-5); } .review-invite { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: var(--cx-space-3) 0 0; border-left: none; border-top: 1px solid var(--cx-border); } }
@media(max-width: 768px) { .movie-reviews { margin-top: 35px; padding-top: 25px; } .review-summary { padding: var(--cx-space-5); grid-template-columns: 110px minmax(0,1fr); } .average strong { font-size: 39px; } .average small { font-size: 10px; } .review-invite { flex-wrap: wrap; } }
</style>
