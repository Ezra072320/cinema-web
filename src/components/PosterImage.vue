<script setup lang="ts">
/**
 * 影片海报 —— 带失败兜底的通用图片.
 *
 * 海报加载失败(老数据/外链失效)时退回渐变占位: 片名首字 + 辅助小字.
 * 这个占位之前在 MovieCard / Orders / PayOrder / MovieInfo / OrderInfo / Home
 * 六处各画了一遍.
 *
 * 尺寸由父容器控制(组件撑满父级), 常见用法是配 aspect-ratio 容器.
 */
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    src?: string | null;
    alt?: string;
    /** 占位首字(通常是片名首字); 不传则占位只显示渐变 */
    initial?: string;
    /** 占位首字下方的辅助小字(通常是类型) */
    sub?: string;
  }>(),
  { src: null, alt: '', initial: '', sub: '' },
);

const failed = ref(false);
// src 变了要重置失败态, 否则翻页/换数据后永远停在占位
watch(() => props.src, () => { failed.value = false; });
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="alt"
    class="poster-image"
    loading="lazy"
    decoding="async"
    @error="failed = true"
  />
  <div v-else class="poster-image poster-image--placeholder" aria-hidden="true">
    <span v-if="initial" class="initial">{{ initial }}</span>
    <span v-if="sub" class="sub">{{ sub }}</span>
  </div>
</template>

<style scoped lang="scss">
.poster-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;

  &--placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: linear-gradient(135deg, #1a1f2e 0%, #2a2235 100%);

    .initial {
      font-size: 40px;
      font-weight: 800;
      color: var(--cx-color-primary);
      opacity: 0.75;
    }

    .sub {
      font-size: 12px;
      color: var(--cx-text-muted);
    }
  }
}
</style>
