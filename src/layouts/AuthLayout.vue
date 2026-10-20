<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="auth-layout">
    <div class="bg-decor" aria-hidden="true">
      <span class="orb orb-1"></span>
      <span class="orb orb-2"></span>
      <span class="orb orb-3"></span>
      <div class="grid"></div>
    </div>

    <RouterLink to="/main" class="brand" aria-label="返回猫头鹰影院首页">
      <img src="/logo.svg" alt="" class="brand-logo" />
      <span class="brand-text">猫头鹰影院</span>
    </RouterLink>

    <main class="auth-main">
      <RouterView v-slot="{ Component }">
        <transition name="fade-up" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>

    <footer class="auth-footer">猫头鹰影院 ©2026 · Powered by Vue 3 + Element Plus</footer>
  </div>
</template>

<style scoped lang="scss">
.auth-layout {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--cx-bg-base);
  color: var(--cx-text-primary);
  overflow: hidden;
  isolation: isolate;
}

/* 装饰背景 */
.bg-decor {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(96px);
  opacity: 0.5;
  animation: float 12s ease-in-out infinite;

  &.orb-1 {
    width: 520px;
    height: 520px;
    background: radial-gradient(circle, #7c1d3f, transparent 70%);
    top: -180px;
    left: -120px;
    animation-delay: 0s;
  }
  &.orb-2 {
    width: 420px;
    height: 420px;
    background: radial-gradient(circle, #c9a96e, transparent 70%);
    bottom: -160px;
    right: -100px;
    animation-delay: 4s;
  }
  &.orb-3 {
    width: 320px;
    height: 320px;
    background: radial-gradient(circle, #4338ca, transparent 70%);
    top: 40%;
    right: 10%;
    animation-delay: 8s;
    opacity: 0.3;
  }
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(40px, -30px);
  }
}

/* 细网格背景,营造电影感 */
.grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(circle at center, black 30%, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 70%);
}

/* 品牌 */
.brand {
  position: absolute;
  top: 24px;
  left: 32px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 2;
  border-radius: var(--cx-radius-sm);
  /* 登录/注册页此前没有回首页的入口, 键盘用户也无处可去 */
  transition: opacity var(--cx-duration-fast) var(--cx-ease);

  &:hover { opacity: 0.82; }
}
.brand-logo {
  width: 32px;
  height: 32px;
}
.brand-text {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.02em;
  background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* 主区 */
.auth-main {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  justify-content: center;
  padding: var(--cx-space-6);
}

/* 页脚 */
.auth-footer {
  position: absolute;
  bottom: 16px;
  font-size: 12px;
  color: var(--cx-text-muted);
  z-index: 1;
  letter-spacing: 0.05em;
}

/* 路由过渡 */
.fade-up-enter-active,
.fade-up-leave-active {
  transition:
    opacity 280ms var(--cx-ease-out),
    transform 280ms var(--cx-ease-out);
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

@media (prefers-reduced-motion: reduce) {
  .orb {
    animation: none;
  }
  .fade-up-enter-active,
  .fade-up-leave-active {
    transition: none;
  }
}
</style>
