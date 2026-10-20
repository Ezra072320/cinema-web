<script setup lang="ts">
import { useRouter, RouterLink } from 'vue-router';
const router = useRouter();

function goBack() {
  if (window.history.length > 1) router.back();
  else router.replace('/main');
}
</script>

<template>
  <div class="not-found">
    <div class="bg-decor" aria-hidden="true">
      <span class="orb orb-1"></span>
      <span class="orb orb-2"></span>
    </div>
    <div class="content">
      <div class="code">404</div>
      <h1 class="title">这片银幕暂时没有内容</h1>
      <p class="hint">你访问的页面不存在,或者已经被下架了.</p>
      <div class="actions">
        <el-button type="primary" round @click="router.replace('/main')">
          返回首页
        </el-button>
        <el-button round @click="goBack">上一页</el-button>
      </div>
      <div class="quick">
        <RouterLink to="/movie">浏览热映影片</RouterLink>
        <RouterLink to="/hall">查看影厅排期</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.not-found {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cx-bg-base);
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

.bg-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: -1;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.4;

  &.orb-1 {
    width: 480px;
    height: 480px;
    background: radial-gradient(circle, var(--cx-color-primary), transparent 70%);
    top: -160px;
    right: -120px;
  }
  &.orb-2 {
    width: 380px;
    height: 380px;
    background: radial-gradient(circle, var(--cx-color-accent), transparent 70%);
    bottom: -140px;
    left: -100px;
  }
}

.content {
  text-align: center;
  max-width: 540px;
  padding: var(--cx-space-8);
  color: var(--cx-text-primary);
}

.code {
  font-size: 160px;
  font-weight: 900;
  letter-spacing: -0.06em;
  line-height: 1;
  background: linear-gradient(135deg, var(--cx-color-primary), var(--cx-color-accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-bottom: var(--cx-space-4);
}

.title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 var(--cx-space-3);
}

.hint {
  color: var(--cx-text-secondary);
  margin-bottom: var(--cx-space-6);
  font-size: 14px;
}

.actions {
  display: flex;
  gap: var(--cx-space-3);
  justify-content: center;
}

.quick {
  margin-top: var(--cx-space-5);
  display: flex;
  gap: var(--cx-space-5);
  justify-content: center;
  font-size: 13px;

  a {
    color: var(--cx-text-secondary);

    &:hover { color: var(--cx-color-primary); }
  }
}
</style>
