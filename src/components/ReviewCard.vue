<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { ReviewView } from '@/types';
const props = defineProps<{ review: ReviewView; showMovie?: boolean; deleting?: boolean }>();
defineEmits<{ remove: [review: ReviewView] }>();
const router = useRouter();
const edited = computed(() => Boolean(props.review.updateTime) && props.review.updateTime !== props.review.createTime);
function edit() { router.push({ name: 'score', params: { movieId: props.review.movieId, orderId: props.review.orderId } }); }
</script>
<template>
  <article class="review-card cx-card">
    <div v-if="showMovie" class="review-movie"><img v-if="review.poster" :src="review.poster" alt="" loading="lazy" /><div><button class="movie-link" @click="router.push('/movie/' + review.movieId)">{{ review.movieTitle || '影片资料暂不可用' }}</button><span :class="{ unpublished: !review.published }">{{ review.published ? '已公开 · 真实购票评价' : '暂未公开' }}</span></div></div>
    <div class="review-meta"><strong>{{ showMovie ? '我的评分' : review.author }}</strong><span v-if="review.mine && !showMovie" class="mine-label">我的评价</span><span class="review-date">{{ review.createTime?.slice(0, 16) || '历史评价' }}<template v-if="edited"> · 已编辑</template></span></div>
    <div class="rating"><el-rate :model-value="review.score || 0" disabled aria-label="观影评分" /><span>{{ review.score ? review.score + ' / 5' : '评分待补全' }}</span></div>
    <p v-if="review.content" class="review-content">{{ review.content }}</p><p v-else class="no-content">这位观众留下了评分，没有填写短评。</p>
    <p v-if="showMovie && !review.published" class="publication-hint">{{ review.reason || '评分资料需补全后才会公开展示' }}。不计入影片当前评分统计。</p>
    <div v-if="review.mine && review.orderId" class="review-actions"><el-button text type="primary" @click="edit">{{ review.editable ? '修改评价' : '查看评价' }}</el-button><el-button v-if="showMovie" text :disabled="deleting" @click="router.push('/order/' + review.orderId)">查看订单</el-button><el-button v-if="showMovie" type="danger" text :loading="deleting" @click="$emit('remove', review)">删除评价</el-button></div>
  </article>
</template>
<style scoped lang="scss">
.review-card { padding: 22px var(--cx-space-6); }
.review-movie { display: flex; gap: 13px; align-items: center; padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--cx-border); img { width: 44px; height: 64px; object-fit: cover; border-radius: 5px; } > div { min-width: 0; } span { display: block; font-size: 10px; color: #9ebfac; margin-top: var(--cx-space-2); &.unpublished { color: var(--cx-text-muted); } } }
.movie-link { text-align: left; border: none; padding: 0; background: none; color: var(--cx-text-primary); font: inherit; font-size: 15px; line-height: 1.7; cursor: pointer; &:hover { color: var(--cx-color-primary); } }
.review-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--cx-space-2); strong { font-weight: 500; font-size: 13px; } .review-date { margin-left: auto; color: var(--cx-text-muted); font-size: 10px; } }
.mine-label { font-size: 10px; color: var(--cx-color-primary); padding: 2px 6px; background: color-mix(in srgb, var(--cx-color-primary) 8%, transparent); border-radius: 4px; }
.rating { display: flex; align-items: center; gap: 10px; margin: var(--cx-space-2) 0; span { font-size: 11px; color: var(--cx-color-primary); } }
.review-content { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--cx-text-secondary); font-size: 13px; line-height: 1.95; margin: var(--cx-space-2) 0; }
.no-content,.publication-hint { color: var(--cx-text-muted); font-size: 12px; line-height: 1.8; }
.publication-hint { border-left: 2px solid color-mix(in srgb, var(--cx-color-primary) 30%, transparent); padding-left: 10px; font-size: 11px; }
.review-actions { display: flex; flex-wrap: wrap; gap: var(--cx-space-1); border-top: 1px solid var(--cx-border); padding-top: var(--cx-space-2); margin-top: var(--cx-space-4); .el-button + .el-button { margin-left: 0; } }
@media(max-width: 768px) { .review-card { padding: 18px; } .review-meta .review-date { width: 100%; margin-left: 0; } }
</style>
