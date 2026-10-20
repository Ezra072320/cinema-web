<script setup lang="ts">
withDefaults(
  defineProps<{ backdrop?: string; title?: string; height?: string }>(),
  { height: '320px' },
);
</script>

<template>
  <section class="banner" :style="{ height }">
    <!-- 用 <img> 替代 CSS background-image: 可懒加载/解码、有 alt; object-fit: cover 复刻原裁切 -->
    <img
      v-if="backdrop"
      class="banner-bg"
      :src="backdrop"
      :alt="title || ''"
      loading="eager"
      fetchpriority="high"
      decoding="async"
    />
    <!-- 压暗渐变: 与原 background 叠加层一致, 保证白字可读 -->
    <div v-if="backdrop" class="banner-overlay" aria-hidden="true"></div>
    <div class="banner-content">
      <h1 v-if="title" class="banner-title">{{ title }}</h1>
    </div>
  </section>
</template>

<style scoped lang="scss">
.banner {
  position: relative;
  border-radius: var(--cx-radius-lg);
  display: flex;
  align-items: flex-end;
  padding: var(--cx-space-6);
  margin-bottom: var(--cx-space-4);
  background: linear-gradient(135deg, #1a1f2e 0%, #2a2235 100%);
  overflow: hidden;
}
.banner-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 20, 25, 0.4) 0%, rgba(15, 20, 25, 0.85) 80%);
}
.banner-content {
  position: relative;
  z-index: 1;
  color: #fff;
  max-width: 720px;
}
.banner-title {
  font-size: 36px;
  font-weight: 800;
  margin: 0 0 8px 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
</style>
