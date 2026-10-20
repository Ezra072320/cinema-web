<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fileApi, movieAdminApi } from '@/api';
import type { Movie, MovieMetadataField } from '@/types';

const props = defineProps<{ movie: Movie }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const entries: { key: MovieMetadataField; label: string; max?: number; hint?: string }[] = [
  { key: 'runtimeMin', label: '时长', hint: '整数分钟。排片前必须补齐。' },
  { key: 'releaseDate', label: '大陆上映日' },
  { key: 'cat', label: '类型', max: 255, hint: '多个类型用英文逗号分隔。' },
  { key: 'dir', label: '导演', max: 255, hint: '多位导演用英文逗号分隔。' },
  { key: 'area', label: '地区', max: 64 },
  { key: 'language', label: '语言', max: 32 },
  { key: 'summary', label: '简介', max: 10000 },
  { key: 'posterUrl', label: '海报', max: 512 },
];
const initial = Object.fromEntries(entries.map(({ key }) => [key, String(
  key === 'runtimeMin' ? props.movie.runtimeMin || ''
    : key === 'posterUrl' ? props.movie.posterUrl || '' : props.movie[key] || '',
)])) as Record<MovieMetadataField, string>;
const form = reactive({ ...initial });
const originalLocks = new Set(props.movie.lockedFields || []);
const protectedFields = reactive(Object.fromEntries(entries.map(({ key }) => [key, originalLocks.has(key)])) as Record<MovieMetadataField, boolean>);
const saving = ref(false);
const uploading = ref(false);
const uploadInput = ref<HTMLInputElement>();
const valueOf = (key: MovieMetadataField) => String(form[key] ?? '').trim();
const changed = (key: MovieMetadataField) => valueOf(key) !== initial[key].trim();
function edited(key: MovieMetadataField) { if (changed(key) && valueOf(key)) protectedFields[key] = true; }
const dirty = computed(() => entries.some(({ key }) => changed(key) || protectedFields[key] !== originalLocks.has(key)));

async function uploadPoster(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    ElMessage.warning('请选择 5 MB 以内的 JPG、PNG 或 WebP 图片');
    input.value = '';
    return;
  }
  uploading.value = true;
  try {
    form.posterUrl = await fileApi.upload(file);
    edited('posterUrl');
    ElMessage.success('海报已上传，保存补录后生效');
  } catch (error) { ElMessage.error((error as { msg?: string })?.msg || '海报上传失败'); }
  finally { uploading.value = false; input.value = ''; }
}

async function save() {
  const fields: Partial<Record<MovieMetadataField, string>> = {};
  const unlockFields: MovieMetadataField[] = [];
  for (const { key, label } of entries) {
    if (changed(key) || (protectedFields[key] && !originalLocks.has(key))) {
      const value = valueOf(key);
      if (!value) { ElMessage.warning(`${label}不能为空；未知资料请保留原状`); return; }
      if (key === 'runtimeMin' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1440)) {
        ElMessage.warning('时长需为 1～1440 的整数分钟'); return;
      }
      fields[key] = value;
    } else if (originalLocks.has(key) && !protectedFields[key]) unlockFields.push(key);
  }
  saving.value = true;
  try {
    await movieAdminApi.editMetadata(props.movie.id, { fields, unlockFields, expectedRevision: props.movie.manualRevision || 0 });
    ElMessage.success('资料已保存，人工确认字段将受到保护');
    emit('saved');
  } catch (error) { ElMessage.error((error as { msg?: string })?.msg || '保存失败'); }
  finally { saving.value = false; }
}
</script>

<template>
  <el-dialog :model-value="true" title="核实补录" width="min(720px, 94vw)" :close-on-click-modal="false"
    :close-on-press-escape="!saving && !uploading" :show-close="!saving && !uploading" @close="emit('close')">
    <div class="metadata-heading"><strong>{{ movie.title }}</strong><span>只填写已核实的资料，未知项继续保留待补。</span></div>
    <el-alert type="info" :closable="false" show-icon title="填写并保存的字段会自动设为人工确认，后续更新和补缺均会保留。取消勾选可恢复来源更新，原值仍保留。" />
    <el-form class="metadata-form" label-position="top" :disabled="saving">
      <el-form-item v-for="entry in entries" :key="entry.key" :class="{ 'metadata-wide': ['summary', 'posterUrl'].includes(entry.key) }">
        <template #label><span class="metadata-label">{{ entry.label }}
          <span v-if="!initial[entry.key]" class="metadata-missing">待补</span>
          <el-checkbox v-model="protectedFields[entry.key]" :disabled="!valueOf(entry.key) || changed(entry.key)">人工确认</el-checkbox>
        </span></template>
        <el-date-picker v-if="entry.key === 'releaseDate'" v-model="form.releaseDate" type="date" :clearable="false" value-format="YYYY-MM-DD" placeholder="请选择已核实的大陆上映日" @change="edited(entry.key)" />
        <template v-else-if="entry.key === 'posterUrl'">
          <div class="metadata-poster">
            <img v-if="form.posterUrl" :src="form.posterUrl" alt="影片海报预览" />
            <div><el-button :loading="uploading" @click="uploadInput?.click()">上传海报</el-button><p>JPG、PNG 或 WebP，最大 5 MB。上传至阿里云 OSS。</p></div>
          </div>
        </template>
        <el-input v-else v-model="form[entry.key]" :type="entry.key === 'summary' ? 'textarea' : 'text'" :rows="4"
          :maxlength="entry.max" :inputmode="entry.key === 'runtimeMin' ? 'numeric' : undefined"
          :placeholder="`填写已核实的${entry.label}`" @input="edited(entry.key)">
          <template v-if="entry.key === 'runtimeMin'" #append>分钟</template>
        </el-input>
        <span v-if="entry.hint" class="metadata-help">{{ entry.hint }}</span>
      </el-form-item>
    </el-form>
    <input ref="uploadInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="uploadPoster" />
    <template #footer><el-button :disabled="saving || uploading" @click="emit('close')">取消</el-button><el-button type="primary" :loading="saving" :disabled="!dirty || uploading" @click="save">保存补录</el-button></template>
  </el-dialog>
</template>

<style scoped lang="scss">
.metadata-heading { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; strong { font-size: 19px; } span { color: var(--cx-text-muted); } }
.metadata-form { display: grid; grid-template-columns: 1fr 1fr; column-gap: 22px; margin-top: 22px; }
.metadata-wide { grid-column: 1 / -1; }
.metadata-label { display: flex; align-items: center; gap: 8px; width: 100%; .el-checkbox { margin-left: auto; height: 24px; } }
.metadata-form :deep(.el-form-item__label) { width: 100%; }
.metadata-form :deep(.el-date-editor) { width: 100%; }
.metadata-help { color: var(--cx-text-muted); font-size: 12px; line-height: 1.6; margin-top: 5px; }
.metadata-missing { color: var(--el-color-warning); font-size: 11px; }
.metadata-poster { display: flex; align-items: center; gap: 18px; img { width: 66px; height: 94px; object-fit: cover; border-radius: 6px; } p { color: var(--cx-text-muted); font-size: 12px; margin-bottom: 0; } }
@media (max-width: 580px) { .metadata-form { grid-template-columns: 1fr; } }
</style>
