<script setup lang="ts">
import type { MovieCastVO } from '@/types';

/**
 * 演员 + 角色名 横滑列表.
 *
 * props:
 *  - cast: 演员 + character
 */
defineProps<{ cast: MovieCastVO[] }>();
</script>

<template>
  <div v-if="cast?.length" class="cast-list">
    <div v-for="c in cast" :key="`c-${c.person.id}-${c.order}`" class="cast-item">
      <div class="avatar">
        <img
          v-if="c.person.profileUrl || c.person.pic"
          :src="c.person.profileUrl || c.person.pic"
          :alt="c.person.name"
          loading="lazy"
          decoding="async"
        />
        <span v-else class="avatar-placeholder">{{ c.person.name?.charAt(0) }}</span>
      </div>
      <div class="meta">
        <div class="name" :title="c.person.name">{{ c.person.name }}</div>
        <div v-if="c.character" class="character" :title="c.character">饰 {{ c.character }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cast-list {
  display: flex;
  gap: var(--cx-space-4);
  overflow-x: auto;
  padding: var(--cx-space-2) 0;
  scrollbar-width: thin;
}
.cast-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 84px;
}
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid var(--cx-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  img { width: 100%; height: 100%; object-fit: cover; }
}
.avatar-placeholder {
  font-size: 22px;
  font-weight: 600;
  color: var(--cx-color-primary);
}
.meta {
  text-align: center;
  max-width: 84px;
}
.name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--cx-text-primary);
}
.character {
  font-size: 11px;
  color: var(--cx-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
