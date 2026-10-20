<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChatDotRound } from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const prompt = computed(() => {
  if (route.name === 'movie-detail') return '我想了解电影ID为' + route.params.id + '的影片，帮我看看详情和可购场次。';
  if (route.name === 'seats') return '帮我查询场次ID为' + route.params.scheduleId + '的余座和实际票价，并解释情侣座怎么选。';
  if (route.name === 'pay' || route.name === 'order-info' || route.name === 'score')
    return '帮我查看我的订单ID为' + route.params.orderId + '的详情，并说明目前可以办理哪些操作。';
  if (route.name === 'me-wants') return '帮我看看我的想看清单，哪些现在可以买票？';
  if (route.name === 'me-orders') return '帮我查一下我的订单，看看待支付和退票情况。';
  if (route.name === 'hall-by-movie') return '我想看电影ID为' + route.params.movieId + '的影片，帮我查今天的场次和票价。';
  return '';
});
function open() {
  router.push({ name: 'ai-chat', query: prompt.value ? { ask: prompt.value } : {} });
}
</script>

<template>
  <button v-if="route.name !== 'ai-chat'" class="assistant-launcher" aria-label="向小智咨询当前页面业务" @click="open">
    <el-icon><ChatDotRound /></el-icon><span>问小智</span>
  </button>
</template>

<style scoped lang="scss">
.assistant-launcher {
  position: fixed; right: 24px; bottom: 28px; z-index: 90;
  display: flex; align-items: center; gap: 8px; padding: 12px 17px;
  border: 1px solid color-mix(in srgb, var(--cx-color-primary) 50%, transparent); border-radius: 30px;
  color: var(--cx-color-primary); background: var(--cx-bg-elevated);
  box-shadow: 0 6px 28px rgba(0,0,0,.25); cursor: pointer; font: inherit; font-size: 12px;
  .el-icon { font-size: 21px; }
  &:hover { border-color: var(--cx-color-primary); }
  &:focus-visible { outline: 2px solid var(--cx-color-primary); outline-offset: 3px; }
}
@media(max-width:768px) { .assistant-launcher { right: 14px; bottom: 18px; padding: 10px 13px; } }
</style>
