<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, EditPen, Refresh } from '@element-plus/icons-vue';
import { reviewApi } from '@/api';
import type { ReviewContext } from '@/types';

const route = useRoute();
const router = useRouter();
const orderId = computed(() => Number(route.params.orderId));
const context = ref<ReviewContext | null>(null);
const loading = ref(true);
const loadError = ref<unknown>(null);
const saveError = ref('');
const formRef = ref<FormInstance>();
const form = reactive({ score: 0, content: '' });
const saving = ref(false);
const deleting = ref(false);
const saved = ref(false);
let loadSeq = 0;
const dirty = computed(() => form.score !== (context.value?.review?.score ?? 0)
  || form.content !== (context.value?.review?.content ?? ''));
const editable = computed(() => Boolean(context.value?.canReview) && !loading.value && !saving.value && !deleting.value);
const rules: FormRules = {
  score: [{ validator: (_rule, value, callback) => {
    if (!Number.isInteger(value) || value < 1 || value > 5) callback(new Error('请先选择1至5分评分'));
    else callback();
  }, trigger: 'change' }],
  content: [{ max: 1024, message: '短评最多1024字', trigger: 'change' }],
};

async function load() {
  const seq = ++loadSeq;
  loading.value = true; loadError.value = null; saveError.value = '';
  try {
    if (!Number.isSafeInteger(orderId.value) || orderId.value < 1) throw new Error('订单编号不合法');
    const result = await reviewApi.context(orderId.value);
    if (seq !== loadSeq) return;
    context.value = result;
    form.score = result.review?.score ?? 0;
    form.content = result.review?.content ?? '';
    await Promise.resolve();
    formRef.value?.clearValidate();
  } catch (err) { if (seq === loadSeq) { loadError.value = err; context.value = null; } }
  finally { if (seq === loadSeq) loading.value = false; }
}
async function reload() {
  if (dirty.value) {
    try { await ElMessageBox.confirm('重新载入将替换尚未保存的修改。', '载入最新评价', { confirmButtonText: '重新载入', cancelButtonText: '继续编辑' }); }
    catch { return; }
  }
  await load();
}
async function submit() {
  if (!editable.value || !formRef.value || !context.value) return;
  if (!await formRef.value.validate().catch(() => false)) return;
  saving.value = true; saveError.value = '';
  try {
    await reviewApi.save({ orderId: orderId.value, score: form.score, content: form.content.trim(),
      expectedVersion: context.value.review?.version ?? 0 });
    saved.value = true;
    ElMessage.success(context.value.review ? '评价已更新' : '评价已发表');
    await router.push('/me/reviews');
  } catch (err) {
    const e = err as { msg?: string; message?: string; response?: { data?: { msg?: string } } };
    saveError.value = e.response?.data?.msg ?? e.msg ?? e.message ?? '保存失败，请稍后重试';
  } finally { saving.value = false; }
}
async function remove() {
  const review = context.value?.review;
  if (!review || deleting.value || saving.value) return;
  try { await ElMessageBox.confirm('删除后，短评及评分将从影片页移除。符合评价条件时可重新发表。', '删除这条评价？',
    { type: 'warning', confirmButtonText: '删除评价', cancelButtonText: '保留' }); }
  catch { return; }
  deleting.value = true;
  try {
    await reviewApi.remove(orderId.value, review.version);
    saved.value = true; ElMessage.success('评价已删除'); await router.push('/me/reviews');
  } catch { /* API拦截器展示错误 */ }
  finally { deleting.value = false; }
}
onBeforeRouteLeave(async () => {
  if (saved.value) return true;
  if (saving.value || deleting.value) return false;
  if (!dirty.value || saved.value) return true;
  try { await ElMessageBox.confirm('评价尚未保存，确定离开？', '保留这份观后感', { confirmButtonText: '离开页面', cancelButtonText: '继续编辑' }); return true; }
  catch { return false; }
});
watch(orderId, () => { saved.value = false; load(); }, { immediate: true });
</script>

<template>
  <div class="review-editor cx-page">
    <button class="back-link" @click="router.push('/me/reviews')"><el-icon><ArrowLeft /></el-icon>我的评价</button>
    <PageSkeleton v-if="loading" :rows="4" />
    <ErrorState v-else-if="loadError" :error="loadError" @retry="load" />
    <template v-else-if="context">
      <header class="editor-heading"><span class="eyebrow">AFTER THE CREDITS</span><h1>{{ context.review ? '重温这份观后感' : '把观影感受，留在这里' }}</h1><p>真实购票 · 一单一评 · 评分与订单状态独立</p></header>
      <div class="editor-layout">
        <aside class="movie-ticket cx-card"><img v-if="context.poster" :src="context.poster" :alt="context.movieTitle || '影片海报'" /><div class="ticket-info"><span>你的这场电影</span><h2>{{ context.movieTitle || '影片资料暂不可用' }}</h2><p>{{ context.hallName || '影厅资料暂不可用' }}</p><p>{{ context.startTime?.slice(0, 16) }}</p><el-button v-if="context.movieId" text type="primary" @click="router.push('/movie/' + context.movieId)">查看影片与短评</el-button></div></aside>
        <section class="editor-form cx-card">
          <div v-if="!context.canReview" class="eligibility" role="status"><strong>{{ context.reason }}</strong><span v-if="context.availableAt">预计开放时间：{{ context.availableAt.slice(0, 16) }}</span><el-button text type="primary" :icon="Refresh" @click="reload">刷新评价资格</el-button></div>
          <p v-else class="eligibility allowed"><el-icon><EditPen /></el-icon>{{ context.review ? '你可以修改自己的评分与短评，保存后将更新影片页。' : '已满足评价条件，分享你的真实观影感受。' }}</p>
          <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="!editable">
            <el-form-item label="你的评分" prop="score" required><el-rate v-model="form.score" :max="5" :texts="['不太喜欢', '略有遗憾', '中规中矩', '值得一看', '非常推荐']" show-text aria-label="观影评分，1至5分" /></el-form-item>
            <el-form-item label="观影短评（选填）" prop="content"><el-input v-model="form.content" type="textarea" :rows="8" maxlength="1024" show-word-limit placeholder="哪些情节、表演或画面，让你留下了印象？" /></el-form-item>
          </el-form>
          <p class="publish-note">评价会公开展示，昵称将做遮蔽处理。请勿在短评中填写手机号等个人信息。</p>
          <div v-if="saveError" class="save-error" role="alert">{{ saveError }}<el-button text type="primary" @click="reload">载入最新评价</el-button></div>
          <div class="editor-actions"><el-button v-if="context.review" type="danger" text :loading="deleting" :disabled="saving" @click="remove">删除评价</el-button><span class="spacer" /><el-button :disabled="saving || deleting" @click="router.push('/order/' + context.orderId)">查看订单</el-button><el-button type="primary" :loading="saving" :disabled="!editable" @click="submit">{{ context.review ? '保存修改' : '发表评价' }}</el-button></div>
          <p v-if="context.review" class="review-time">{{ context.review.createTime ? '发表于 ' + context.review.createTime : '历史评价（原记录未保存发表时间）' }}<span v-if="context.review.updateTime && context.review.updateTime !== context.review.createTime"> · 更新于 {{ context.review.updateTime }}</span></p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.review-editor { padding-top: var(--cx-space-6); padding-bottom: var(--cx-space-12); }
.back-link { display: inline-flex; align-items: center; gap: 7px; padding: 0; border: 0; background: none; color: var(--cx-text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.editor-heading { margin: 30px 0 28px; h1 { font-family: 'STSong', 'Songti SC', serif; font-size: clamp(27px, 3vw, 38px); font-weight: 500; letter-spacing: 2px; margin: 10px 0; } p { color: var(--cx-text-muted); font-size: 12px; } }
.eyebrow { color: var(--cx-color-primary); font-size: 10px; letter-spacing: 3px; }
.editor-layout { display: grid; grid-template-columns: 270px minmax(0,1fr); gap: var(--cx-space-6); align-items: start; }
.movie-ticket { padding: 0; overflow: hidden; img { display: block; width: 100%; aspect-ratio: 2 / 3; object-fit: cover; } }
.ticket-info { padding: 22px; border-top: 1px dashed color-mix(in srgb, var(--cx-color-primary) 35%, transparent); > span { color: var(--cx-color-primary); font-size: 10px; letter-spacing: 2px; } h2 { font-size: 18px; line-height: 1.6; margin: var(--cx-space-3) 0; } p { color: var(--cx-text-secondary); font-size: 12px; } .el-button { padding-left: 0; } }
.editor-form { min-width: 0; padding: 30px; :deep(.el-rate) { height: auto; flex-wrap: wrap; gap: 3px; } :deep(.el-rate__icon) { font-size: 28px; } :deep(.el-textarea__inner) { font-size: 14px; line-height: 1.9; resize: vertical; } :deep(.el-form-item__label) { color: var(--cx-text-primary); } }
.eligibility { display: flex; flex-direction: column; align-items: flex-start; gap: var(--cx-space-2); padding: 14px var(--cx-space-4); margin: 0 0 25px; border-left: 2px solid var(--cx-color-primary); background: color-mix(in srgb, var(--cx-color-primary) 6%, transparent); color: var(--cx-text-secondary); font-size: 12px; line-height: 1.8; strong { font-weight: 500; } &.allowed { flex-direction: row; align-items: center; gap: var(--cx-space-2); color: #9ebfac; } }
.publish-note,.review-time { color: var(--cx-text-muted); font-size: 11px; line-height: 1.8; }
.editor-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: var(--cx-space-6); .el-button + .el-button { margin-left: 0; } .spacer { flex: 1; } }
.review-time { border-top: 1px solid var(--cx-border); padding-top: 18px; margin-top: var(--cx-space-6); }
.save-error { color: #e6a88c; font-size: 12px; padding: var(--cx-space-2) 0; }
@media(max-width: 768px) { .editor-layout { grid-template-columns: minmax(0,1fr); } .movie-ticket { display: flex; img { width: 100px; aspect-ratio: 2 / 3; } } .ticket-info { border-top: 0; border-left: 1px dashed color-mix(in srgb, var(--cx-color-primary) 35%, transparent); padding: 13px 18px; h2 { font-size: 15px; margin: 5px 0; } p { margin: 6px 0; } } .editor-form { padding: var(--cx-space-5); } .editor-heading { margin: var(--cx-space-6) 0; } }
</style>
