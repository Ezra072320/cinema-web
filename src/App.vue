<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/composables/useAuth';

/**
 * Auth bootstrap 入口.
 *
 * 旧的实现只在 onMounted 里拉一次,这导致:
 * - 用户在 SPA 首次加载后,再去 /auth/login 然后登录,
 *   App.vue 不会重新挂载,profile 永远不会更新,
 *   PortalLayout/AdminLayout 显示 fallback 字符串("已登录"/"管理员").
 *
 * 现在改成 watch(token):token 由无变有(登录成功 / 刷新页面恢复)都立刻拉一次 /info,
 * 用 force=true 跳过 10s 去重,确保 navbar 立刻拿到用户信息.
 *
 * 同时,因为用了 immediate:true,App 挂载那一刻就能拿到 rehydrated 后的 token,
 * 等同于原来的 onMounted 行为,但更声明式.
 */
const auth = useAuthStore();
const { token } = storeToRefs(auth);
const { bootstrap } = useAuth();

watch(
  token,
  (t) => {
    if (!t) return;             // 退出登录 → 不再拉
    if (auth.profile) return;   // 已有 profile,跳过(避免重复请求)
    bootstrap(true);            // force=true 跳过 10s 去重
  },
  { immediate: true },
);

/**
 * 路由懒加载进度条: 页面组件是动态 import, 切页拉 chunk 期间此前是白屏无反馈.
 */
const router = useRouter();
const routePending = ref(false);
const stopBefore = router.beforeEach((to, from) => {
  if (to.path !== from.path) routePending.value = true;
});
const stopAfter = router.afterEach(() => { routePending.value = false; });
const stopError = router.onError(() => { routePending.value = false; });
onBeforeUnmount(() => {
  stopBefore();
  stopAfter();
  stopError();
});
</script>

<template>
  <el-config-provider>
    <div class="route-progress" :class="{ 'is-active': routePending }" aria-hidden="true" />
    <router-view />
  </el-config-provider>
</template>

<style>
/* 全局基础样式由 src/styles/theme.scss 提供,此处不再覆盖. */
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  z-index: 9999;
  pointer-events: none;
  transform: scaleX(0);
  transform-origin: left;
  opacity: 0;
  background: linear-gradient(90deg, var(--cx-color-primary), var(--cx-color-accent));
  transition:
    transform 700ms var(--cx-ease-out),
    opacity 180ms linear;
}

.route-progress.is-active {
  opacity: 1;
  transform: scaleX(0.8);
}

@media (prefers-reduced-motion: reduce) {
  .route-progress { transition: none; }
}
</style>
