<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
const route = useRoute();
const router = useRouter();
const from = (route.query.from as string) ?? '';

/** 直接落地 /403 时没有历史记录, router.back() 会无响应. */
function goBack() {
  if (window.history.length > 1) router.back();
  else router.replace('/main');
}
</script>

<template>
  <div class="forbidden">
    <div class="content">
      <div class="code">403</div>
      <h1 class="title">无权访问该页面</h1>
      <p class="hint">
        <template v-if="from">当前账号没有访问 <code>{{ from }}</code> 的权限。</template>
        <template v-else>当前账号没有访问该页面的权限。</template>
        如果你认为这是错误，请联系管理员。
      </p>
      <div class="actions">
        <el-button type="primary" round @click="router.replace('/main')">返回首页</el-button>
        <el-button round @click="goBack">上一页</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.forbidden {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--cx-color-accent) 30%, transparent), transparent 50%),
    radial-gradient(circle at 80% 70%, color-mix(in srgb, var(--cx-color-primary) 18%, transparent), transparent 50%),
    var(--cx-bg-base);
  color: var(--cx-text-primary);
}
.content {
  text-align: center;
  max-width: 480px;
  padding: var(--cx-space-8);
}
.code {
  font-size: 120px;
  font-weight: 900;
  letter-spacing: -0.04em;
  background: linear-gradient(135deg, var(--cx-color-accent), var(--cx-color-primary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1;
}
.title {
  font-size: 24px;
  margin: var(--cx-space-4) 0 var(--cx-space-3);
}
.hint {
  color: var(--cx-text-secondary);
  margin-bottom: var(--cx-space-6);
  code {
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 6px;
    border-radius: var(--cx-radius-sm);
    font-family: var(--cx-font-mono);
    font-size: 12px;
  }
}
.actions {
  display: flex;
  gap: var(--cx-space-3);
  justify-content: center;
}
</style>
