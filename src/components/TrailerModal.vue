<script setup lang="ts">
import { computed } from 'vue';
import type { MovieVideo } from '@/types';

const props = defineProps<{ modelValue: boolean; videos: MovieVideo[] }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const first = computed(() => props.videos?.[0]);
const isMp4 = computed(() => first.value?.site === 'mp4');

function close() { emit('update:modelValue', false); }
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :title="first?.name || '预告片'"
    width="min(800px, 92vw)"
    :before-close="close"
    destroy-on-close
    center
  >
    <div v-if="first" class="trailer">
      <video
        v-if="isMp4"
        :src="first.embedUrl"
        controls
        autoplay
        class="media"
      />
      <iframe
        v-else
        :src="first.embedUrl"
        :title="first.name || '预告片'"
        class="media"
        frameborder="0"
        allow="autoplay; encrypted-media; fullscreen"
        allowfullscreen
      />
    </div>
    <template v-else>
      <el-empty description="暂无预告片" />
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.trailer {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: var(--cx-radius-md);
  overflow: hidden;
}
.media {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
