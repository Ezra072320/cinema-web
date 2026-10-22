<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ChatDotRound, Film, Tickets, Star, User, Promotion, Refresh, Plus, Delete, ArrowRight, Check } from '@element-plus/icons-vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { aiApi } from '@/api';
import { useAiStream } from '@/composables/useAiStream';
import { useAuth } from '@/composables/useAuth';
import { useAuthStore } from '@/stores/auth';
import { actionDeadline, mergeAiActions, orderAiActions, safeAiPath } from '@/utils/ai';
import type { AiAction, AiMessage, AiSession } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { bootstrap } = useAuth();
const eligible = computed(() => Boolean(auth.token) && auth.role === 'USER');
const sessions = ref<AiSession[]>([]);
const activeChatId = ref<string>(generateChatId());
const messages = ref<AiMessage[]>([]);
const actions = ref<AiAction[]>([]);
const input = ref(typeof route.query.ask === 'string' ? route.query.ask.slice(0, 4000) : '');
const sending = ref(false);
const stopping = ref(false);
let pendingStop: Promise<unknown> = Promise.resolve();
const loadingHistory = ref(false);
const historyError = ref(false);
const loadingSessions = ref(false);
const sessionsError = ref(false);
const actionBusy = ref<string | null>(null);
const scrollEl = ref<HTMLElement | null>(null);
const actionSectionEl = ref<HTMLElement | null>(null);
const actionFilter = ref<'ALL' | 'PENDING'>('ALL');
const actionsError = ref(false);
const claimWarning = ref(false);
let actionRequestSeq = 0;
const inputEl = ref<{ focus: () => void }>();
const now = ref(Date.now());
const services = [
  { title: '选片与购票', icon: Film, hint: '推荐、场次、余座与票价', prompt: '帮我推荐本店有排片的电影，再看看今天的场次和票价。', path: '/movie' },
  { title: '订单与退票', icon: Tickets, hint: '查订单、取消、退款预估', prompt: '帮我查一下我的订单，看看哪些能取消或申请退票。', path: '/me/orders/5' },
  { title: '我的想看', icon: Star, hint: '查看、加入或移除影片', prompt: '看看我的想看清单，哪些影片现在可以买票？', path: '/me/wants' },
  { title: '观影评价', icon: ChatDotRound, hint: '影片口碑、我的评价与提交评价', prompt: '我评价过哪些电影？再告诉我哪些订单现在可以提交观影评价。', path: '/me/reviews' },
  { title: '账户资料', icon: User, hint: '昵称、年龄、头像与密码', prompt: '帮我查看个人资料，并告诉我怎么修改昵称、头像和密码。', path: '/me/info' },
  { title: '影院服务', icon: Promotion, hint: '支付、退票规则与使用帮助', prompt: '请介绍购票、支付、情侣座和退票的规则。', path: '/hall' },
];
const prompts = ['今晚有什么电影？', '两个人怎么买情侣座？', '查看我的待支付订单', '退票能退多少钱？'];
const quickLinks = [
  { label: '电影', path: '/movie' }, { label: '排期', path: '/hall' },
  { label: '我的订单', path: '/me/orders/5' }, { label: '我的资料', path: '/me/info' },
];
const pendingCount = computed(() => actions.value.filter(isPending).length);
// 多张服务单全部保留；待确认优先，但不隐藏已办理/历史单。
const orderedActions = computed(() => orderAiActions(actions.value, now.value));
const displayedActions = computed(() =>
  actionFilter.value === 'PENDING' ? orderedActions.value.filter(isPending) : orderedActions.value,
);
// 流式接收(连接/帧切分/中断)在 useAiStream; epoch 用于丢弃过期会话的收尾回调
const { stream: streamAi, abort } = useAiStream();
let epoch = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const refreshTimers = new Set<ReturnType<typeof setTimeout>>();

function rememberChat(id?: string) {
  const query = { ...route.query };
  delete query.ask;
  if (id) query.chat = id;
  else delete query.chat;
  void router.replace({ query });
}

function refreshAfterStop(id: string) {
  const version = epoch;
  for (const delay of [600, 1800]) {
    const timeout = setTimeout(() => {
      refreshTimers.delete(timeout);
      if (version === epoch && activeChatId.value === id) void loadActions(id, true);
    }, delay);
    refreshTimers.add(timeout);
  }
}

function generateChatId() { return globalThis.crypto?.randomUUID?.() ?? 'cid-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
function fmtTime(v?: string) { return v ? v.replace('T', ' ').slice(5, 16) : ''; }
function isPending(a: AiAction) { return a.status === 'PENDING' && actionDeadline(a.expiresAt) > now.value; }
function statusText(a: AiAction) {
  if (a.status === 'DONE') return '已办理';
  if (a.status === 'DISMISSED') return '已撤销';
  return isPending(a) ? '待你确认' : '已过期';
}
function actionTypeText(type: AiAction['type']) {
  return ({ CREATE_ORDER: '购票', CANCEL_ORDER: '取消', REFUND_ORDER: '退票', SET_WANT: '想看', SUBMIT_SCORE: '评价', UPDATE_PROFILE: '资料' } as Record<string, string>)[type] ?? type;
}
function statusClass(a: AiAction) {
  if (isPending(a)) return 'pending';
  return a.status === 'DONE' ? 'done' : 'inactive';
}
/** 把多张服务单区域滚到聊天可视区顶部；失败时不阻塞主流程。 */
function scrollToActions() {
  const el = scrollEl.value;
  const section = actionSectionEl.value;
  if (!el || !section) return;
  const delta = section.getBoundingClientRect().top - el.getBoundingClientRect().top;
  el.scrollTo({ top: Math.max(0, el.scrollTop + delta - 12), behavior: 'smooth' });
}

async function loadSessions() {
  if (!eligible.value) return;
  loadingSessions.value = true;
  sessionsError.value = false;
  try { sessions.value = await aiApi.sessions(); }
  catch { sessionsError.value = true; }
  finally { loadingSessions.value = false; }
}

async function loadActions(id: string, reveal = false): Promise<boolean> {
  // 多次刷新可能并发（回复结束、确认/撤销、切换会话）。只允许最后一次响应写入，
  // 否则一个较早的响应晚到会把刚生成的服务单列表覆盖回旧快照。
  const seq = ++actionRequestSeq;
  try {
    const data = await aiApi.actions(id);
    if (seq !== actionRequestSeq || activeChatId.value !== id) return false;
    const beforeIds = new Set(actions.value.map(a => a.id));
    // 按 ID 合并而不是整表覆盖：晚到的旧快照不能删掉已经显示的新服务单。
    const merged = mergeAiActions(actions.value, data);
    actions.value = merged;
    actionsError.value = false;
    // 刷新后如果确实出现了新服务单，撤掉“未检测到新记录”的警告。
    if (merged.some(a => !beforeIds.has(a.id))) claimWarning.value = false;
    const hasPending = data.some(isPending);
    // 用户停在“待确认”筛选时，确认完最后一张要能切回全部，避免看到空面板。
    if (!hasPending && actionFilter.value === 'PENDING') actionFilter.value = 'ALL';
    if (reveal && hasPending) {
      await nextTick();
      scrollToActions();
    }
    return hasPending;
  } catch {
    // 拦截器展示具体错误；这里标记失败，页面给出可重试提示，而不是静默保留旧列表。
    if (seq === actionRequestSeq) actionsError.value = true;
    return false;
  }
}

async function selectSession(s: AiSession) {
  if (actionBusy.value || (s.chatId === activeChatId.value && !loadingHistory.value && !historyError.value)) return;
  stop();
  const version = epoch;
  activeChatId.value = s.chatId;
  messages.value = [];
  actions.value = [];
  actionsError.value = false;
  claimWarning.value = false;
  historyError.value = false;
  rememberChat(s.chatId);
  actionRequestSeq += 1;
  loadingHistory.value = true;
  try {
    const [history, requests] = await Promise.allSettled([aiApi.history(s.chatId), aiApi.actions(s.chatId)]);
    if (version !== epoch || activeChatId.value !== s.chatId) return;
    historyError.value = history.status === 'rejected';
    actionsError.value = requests.status === 'rejected';
    if (history.status === 'fulfilled') messages.value = history.value;
    if (requests.status === 'fulfilled') actions.value = requests.value;
    if (actions.value.some(isPending)) {
      await nextTick();
      scrollToActions();
    } else {
      scrollToBottom(true);
    }
  } catch { /* 统一拦截器处理 */ }
  finally { if (version === epoch) loadingHistory.value = false; }
}

function stop() {
  const wasSending = sending.value;
  const id = activeChatId.value;
  epoch += 1;
  abort();
  if (sending.value) {
    const last = messages.value.at(-1);
    if (last?.role === 'assistant') last.interrupted = true;
  }
  sending.value = false;
  loadingHistory.value = false;
  if (wasSending) {
    stopping.value = true;
    const request = aiApi.stop(id).catch(() => { /* HTTP interceptor reports a stop failure. */ })
      .finally(() => { if (pendingStop === request) stopping.value = false; });
    pendingStop = request;
  }
}

function newChat() {
  if (actionBusy.value) return;
  stop();
  activeChatId.value = generateChatId();
  messages.value = [];
  actions.value = [];
  actionsError.value = false;
  historyError.value = false;
  claimWarning.value = false;
  actionRequestSeq += 1;
  input.value = '';
  rememberChat();
  nextTick(() => inputEl.value?.focus());
}

async function removeSession(s: AiSession) {
  if (sending.value || actionBusy.value) return;
  try {
    await ElMessageBox.confirm('删除“' + (s.title || '新对话') + '”及其历史消息和服务单？', '删除会话',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '保留' });
  } catch { return; }
  try {
    await aiApi.deleteSession(s.chatId);
    sessions.value = sessions.value.filter(x => x.chatId !== s.chatId);
    if (activeChatId.value === s.chatId) newChat();
  } catch { /* 统一拦截器处理 */ }
}

function choosePrompt(value: string) {
  input.value = value;
  nextTick(() => inputEl.value?.focus());
}

async function send() {
  const question = input.value.trim();
  if (!question || sending.value || stopping.value || loadingHistory.value || historyError.value || actionBusy.value) return;
  if (question.length > 4000) { ElMessage.warning('每次最多输入4000字'); return; }
  if (!eligible.value) {
    ElMessage.info(auth.role === 'ADMIN' ? '请使用用户账号登录后咨询个人业务' : '登录后即可咨询并办理影院业务');
    router.push({ name: 'login', query: { redirect: '/ai?ask=' + encodeURIComponent(question) } });
    return;
  }
  const version = ++epoch;
  const chatId = activeChatId.value;
  const actionIdsBefore = new Set(actions.value.map(a => a.id));
  let receivedSnapshot = false;
  rememberChat(chatId);
  claimWarning.value = false;
  messages.value.push({ role: 'user', content: question, ts: Date.now() });
  messages.value.push({ role: 'assistant', content: '', ts: Date.now() });
  // 长会话防 DOM 膨胀: 只保留最近 200 条, 更早的对话仍在服务端历史里
  if (messages.value.length > 200) messages.value.splice(0, messages.value.length - 200);
  const reply = messages.value.at(-1)!;
  input.value = '';
  sending.value = true;
  scrollToBottom(true);
  try {
    await streamAi(question, chatId, auth.token, {
      onText: (text) => { reply.content += text; scrollToBottom(); },
      onErrorFrame: (message) => { reply.error = message; },
      onDone: (snapshot, completed) => {
        if (version !== epoch || activeChatId.value !== chatId) return;
        receivedSnapshot = true;
        actionRequestSeq += 1;
        actions.value = mergeAiActions(actions.value, snapshot);
        actionsError.value = false;
        if (!completed && !reply.error) reply.error = '回复未完成，已生成的服务单仍可核对办理。';
      },
    });
    if (!reply.content && !reply.error) reply.error = '本次未收到回复，请重试。';
  } catch (err) {
    const error = err as { message?: string; name?: string; status?: number };
    if (error.name === 'AbortError') reply.interrupted = true;
    else if (error.status === 401) {
      reply.error = '登录已过期，请重新登录。';
      auth.reset();
      router.replace({ name: 'login', query: { redirect: '/ai' } });
    } else reply.error = error.status === 403 ? '请使用用户账号登录。'
      : error.status && error.message ? error.message
      : reply.content ? '连接已中断，回复可能不完整；请核对服务单状态后重试。' : '客服暂时无法回复，请稍后重试。';
  } finally {
    if (version === epoch) {
      // Keep the composer locked until this turn has reconciled. Otherwise an older
      // finally callback can overwrite the warning/snapshot of the next question.
      await Promise.allSettled([loadSessions(), receivedSnapshot ? Promise.resolve() : loadActions(chatId, true)]);
      if (version === epoch && activeChatId.value === chatId) {
      sending.value = false;
      const hasPending = actions.value.some(isPending);
      const hasNewAction = actions.value.some(a => !actionIdsBefore.has(a.id));
      // 模型有时只“说”生成了服务单，实际没有调用 prepare 工具。页面不伪造服务单，
      // 而是明确提示本次没有新记录，并给出刷新入口。
      const claimsGenerated = /(已生成|已创建|生成成功|已为您生成|已经为您生成).{0,20}(服务单|确认单)|(服务单|确认单).{0,12}(已生成|已创建|生成成功)/.test(reply.content);
      claimWarning.value = claimsGenerated && !hasNewAction && !hasPending;
      if (hasNewAction || (claimsGenerated && actions.value.length)) {
        await nextTick();
        scrollToActions();
      } else if (!hasPending) {
        scrollToBottom();
      }
      }
    }
  }
}

async function stoppedByUser() {
  const id = activeChatId.value;
  stop();
  await pendingStop;
  if (activeChatId.value !== id) return;
  await loadSessions();
  if (sessions.value.some(s => s.chatId === id)) await loadActions(id, true);
  // 用户中断时，工具可能刚好在取消后完成写入；延迟再取一次，避免漏掉最后一张。
  refreshAfterStop(id);
}

async function processAction(a: AiAction, confirm: boolean) {
  if (actionBusy.value || sending.value || stopping.value || !isPending(a)) return;
  actionBusy.value = a.id;
  try {
    const updated = confirm ? await aiApi.confirm(a.id) : await aiApi.dismiss(a.id);
    actions.value = actions.value.map(item => item.id === a.id ? updated : item);
    if (confirm) {
      ElMessage.success(updated.result || '办理成功');
      if (a.type === 'UPDATE_PROFILE') await bootstrap(true);
    }
  } catch {
    // 业务错误由拦截器展示，保留服务单明细供核对并刷新最新状态。
  } finally {
    actionBusy.value = null;
    await loadActions(activeChatId.value);
  }
}

function scrollToBottom(force = false) {
  const el = scrollEl.value;
  const follow = force || !el || el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  if (follow) nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight; });
}

function render(content: string) {
  const html = DOMPurify.sanitize(marked.parse(content, { async: false }) as string,
    { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'form', 'input', 'button', 'style'],
      FORBID_ATTR: ['style', 'target'] });
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('a').forEach(a => {
    const safe = safeAiPath(a.getAttribute('href'));
    if (safe) a.setAttribute('href', safe);
    else a.removeAttribute('href');
  });
  return document.body.innerHTML;
}

function followLink(event: MouseEvent) {
  const a = (event.target as HTMLElement).closest('a');
  if (!a) return;
  event.preventDefault();
  go(a.getAttribute('href'));
}
function go(path?: string | null) {
  const safe = safeAiPath(path);
  if (safe) router.push(safe);
  else ElMessage.info('请通过影院页面中的业务入口访问');
}

onMounted(async () => {
  // now 只驱动办理单的「待确认/已过期」翻转, 30s 精度足够 ——
  // 每秒 tick 会让整个聊天页每秒重渲染一遍(DOM 大时不便宜)
  timer = setInterval(() => { now.value = Date.now(); }, 30_000);
  if (!eligible.value) return;
  await loadSessions();
  if (!route.query.ask && sessions.value.length) {
    const selected = sessions.value.find(s => s.chatId === route.query.chat) ?? sessions.value[0];
    await selectSession(selected);
  }
});
onBeforeUnmount(() => {
  stop();
  if (timer) clearInterval(timer);
  for (const timeout of refreshTimers) clearTimeout(timeout);
});
</script>

<template>
  <div class="service-desk cx-page">
    <aside class="desk-sidebar cx-glass">
      <div class="desk-brand"><span class="brand-mark"><el-icon><ChatDotRound /></el-icon></span><div><strong>小智 · 影院服务台</strong><span>从选片到散场，都在这里</span></div></div>
      <el-button type="primary" class="new-chat" :icon="Plus" :disabled="!!actionBusy" @click="newChat">开始新对话</el-button>
      <div class="sidebar-heading"><span>最近对话</span><el-button text circle :icon="Refresh" aria-label="刷新会话" :loading="loadingSessions" @click="loadSessions" /></div>
      <div class="session-list" :aria-busy="loadingSessions">
        <p v-if="!eligible" class="sidebar-empty">登录后保存对话，也能查询和办理你的个人业务。</p>
        <button v-else-if="sessionsError" class="text-retry" @click="loadSessions">会话加载失败，点击重试</button>
        <p v-else-if="!sessions.length && !loadingSessions" class="sidebar-empty">新的观影计划，从第一句开始。</p>
        <div v-for="s in sessions" :key="s.chatId" class="session" :class="{ active: s.chatId === activeChatId }">
          <button class="session-open" :disabled="!!actionBusy" @click="selectSession(s)"><span>{{ s.title || '新对话' }}</span><small>{{ fmtTime(s.updateTime || s.createTime) }}</small></button>
          <button class="session-delete" :disabled="sending || !!actionBusy" :aria-label="'删除会话 ' + s.title" @click="removeSession(s)"><el-icon><Delete /></el-icon></button>
        </div>
      </div>
      <div class="sidebar-links"><span>直接办理</span><div><button v-for="link in quickLinks" :key="link.path" @click="go(link.path)">{{ link.label }} <el-icon><ArrowRight /></el-icon></button></div></div>
    </aside>

    <main class="desk-chat">
      <header class="chat-header">
        <div><span class="eyebrow">CINEMA CONCIERGE</span><h1>你的专属观影助手</h1></div>
        <div class="header-side">
          <el-button v-if="actions.length" text size="small" class="action-jump" @click="scrollToActions">
            服务单 <strong>{{ actions.length }}</strong><span v-if="pendingCount"> · {{ pendingCount }} 待确认</span>
          </el-button>
          <span class="desk-status"><i :class="{ busy: sending }" />{{ sending ? '正在查询与回复' : '影院业务，一站咨询' }}</span>
        </div>
      </header>
      <div v-if="!eligible" class="login-hint">{{ auth.role === 'ADMIN' ? '个人业务需使用用户账号登录。' : '登录后可使用智能咨询、保存历史并办理个人业务。' }}<button @click="go('/auth/login')">去登录 <el-icon><ArrowRight /></el-icon></button></div>
      <div ref="scrollEl" class="messages" :aria-busy="sending || loadingHistory">
        <div v-if="loadingHistory" class="history-loading"><el-icon class="is-loading"><Refresh /></el-icon> 正在读取对话与服务单…</div>
        <p v-else-if="historyError" class="action-warning" role="alert">对话历史加载失败，请重新加载后继续。<button type="button" @click="selectSession(sessions.find(s => s.chatId === activeChatId)!)">重新加载</button></p>
        <section v-else-if="!messages.length" class="welcome">
          <span class="welcome-ticket">一张好电影的入场券</span><h2>今晚，想看点什么？</h2><p>选一部电影，安排一次观影，或处理你的购票事务。</p>
          <div class="service-grid"><button v-for="service in services" :key="service.title" class="service-card" :disabled="sending" @click="choosePrompt(service.prompt)"><el-icon><component :is="service.icon" /></el-icon><strong>{{ service.title }}</strong><span>{{ service.hint }}</span><el-icon class="card-arrow"><ArrowRight /></el-icon></button></div>
          <p class="service-scope">支持影片与排期、选座购票、本人订单、退票、想看、评价和账户服务。</p>
        </section>
        <article v-for="(m, index) in messages" :key="index" class="message" :class="m.role">
          <span class="message-avatar">{{ m.role === 'assistant' ? '智' : '我' }}</span>
          <div class="message-body"><span class="message-role">{{ m.role === 'assistant' ? '小智' : '你' }}</span>
            <div v-if="m.content" class="bubble" @click="followLink" v-html="render(m.content)" />
            <div v-else-if="sending && index === messages.length - 1" class="thinking" role="status">正在查阅影院信息<span>···</span></div>
            <p v-if="m.error" class="message-notice error" role="alert">{{ m.error }}<button v-if="!sending && index === messages.length - 1" @click="choosePrompt(messages[index - 1]?.content || '')">重新提问</button></p>
            <p v-if="m.interrupted" class="message-notice">回复已停止，已生成的服务单仍可查看。</p>
          </div>
        </article>
        <p v-if="messages.length && !sending && !loadingHistory && !actions.length && !claimWarning && !actionsError" class="action-tip">本会话尚无服务单。办理业务时请核对真实服务单并点击确认，聊天文字不会执行操作。</p>
        <p v-if="claimWarning" class="action-warning" role="alert">
          客服消息提到“已生成服务单”，但本次没有检测到新的服务单记录。如果该业务已有待确认单，会在下方显示；否则请刷新状态或重新发送办理请求。聊天文字不会执行业务。
          <button type="button" @click="loadActions(activeChatId, true)">刷新状态</button>
        </p>
        <p v-if="actionsError" class="action-warning" role="alert">
          服务单列表加载失败，当前展示的可能不是最新状态。
          <button type="button" @click="loadActions(activeChatId, true)">重试</button>
        </p>
        <section v-if="actions.length" ref="actionSectionEl" class="action-section" aria-label="本会话服务单">
          <div class="action-heading">
            <h2>本会话服务单 <span class="action-total">共 {{ actions.length }} 张</span><span v-if="pendingCount" class="action-pending">{{ pendingCount }} 项待确认</span></h2>
            <el-button text size="small" :icon="Refresh" :disabled="!!actionBusy" @click="loadActions(activeChatId)">刷新状态</el-button>
          </div>
          <div class="action-filters" role="group" aria-label="服务单筛选">
            <button type="button" :class="{ active: actionFilter === 'ALL' }" @click="actionFilter = 'ALL'">全部 {{ actions.length }}</button>
            <button type="button" :class="{ active: actionFilter === 'PENDING' }" @click="actionFilter = 'PENDING'">待确认 {{ pendingCount }}</button>
          </div>
          <p class="action-tip">请核对明细后点击确认。确认单有效期 5 分钟，查询和拟单不会锁座或扣款；同一会话可以有多张服务单。</p>
          <p v-if="!displayedActions.length" class="action-empty">当前筛选下没有服务单。</p>
          <article v-for="a in displayedActions" :key="a.id" :data-action-id="a.id" class="action-card" :class="{ done: a.status === 'DONE', expired: !isPending(a) && a.status !== 'DONE' }">
            <div class="action-title">
              <strong><span class="action-type">{{ actionTypeText(a.type) }}</span>{{ a.title }}</strong>
              <span class="action-status" :class="statusClass(a)">{{ statusText(a) }}</span>
            </div>
            <p class="action-summary">{{ a.summary }}</p>
            <p v-if="a.result" class="action-result"><el-icon><Check /></el-icon>{{ a.result }}</p>
            <div class="action-buttons">
              <template v-if="isPending(a)">
                <el-button type="primary" :loading="actionBusy === a.id" :disabled="sending || !!actionBusy" @click="processAction(a, true)">确认办理</el-button>
                <el-button :disabled="sending || !!actionBusy" @click="processAction(a, false)">撤销</el-button>
                <small>确认前请核对票价、座位与退款金额</small>
              </template>
              <el-button v-if="a.path && safeAiPath(a.path)" text type="primary" @click="go(a.path)">{{ a.status === 'DONE' && a.type === 'CREATE_ORDER' ? '查看订单与支付状态' : '查看业务页面' }}<el-icon><ArrowRight /></el-icon></el-button>
            </div>
          </article>
        </section>
      </div>
      <div class="composer">
        <div v-if="!messages.length" class="prompt-strip"><button v-for="prompt in prompts" :key="prompt" @click="choosePrompt(prompt)">{{ prompt }}</button></div>
        <form class="input-row" @submit.prevent="send"><el-input ref="inputEl" v-model="input" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" maxlength="4000" placeholder="例如：查一下今晚 7 点后、每张 50 元以内的场次" :disabled="sending || stopping || loadingHistory || historyError || !!actionBusy" @keydown.enter.exact.prevent="($event.isComposing ? undefined : send())" /><el-button v-if="sending" class="send-button" @click="stoppedByUser">停止回复</el-button><el-button v-else class="send-button" type="primary" native-type="submit" :loading="stopping" :disabled="!input.trim() || stopping || loadingHistory || historyError || !!actionBusy" :icon="Promotion">{{ stopping ? '正在停止' : '发送' }}</el-button></form>
        <div class="composer-footer"><span>Enter 发送 · Shift + Enter 换行</span><span>业务以实时查询和确认结果为准 · 支付与退款为模拟业务</span></div>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
.service-desk { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: var(--cx-space-5); height: calc(100dvh - var(--cx-header-h) - 65px); min-height: 570px; padding-top: var(--cx-space-6); padding-bottom: var(--cx-space-3); }
.desk-sidebar { display: flex; flex-direction: column; min-height: 0; border-radius: 16px; padding: var(--cx-space-5) var(--cx-space-3) 14px; }
.desk-brand { display: flex; gap: 10px; align-items: center; padding: 0 5px var(--cx-space-5); strong { display: block; font-size: 15px; } span:not(.brand-mark) { display: block; color: var(--cx-text-muted); font-size: 11px; margin-top: 5px; } }
.brand-mark { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid color-mix(in srgb, var(--cx-color-primary) 50%, transparent); border-radius: 12px; color: var(--cx-color-primary); font-size: 21px; background: color-mix(in srgb, var(--cx-color-primary) 7%, transparent); }
.new-chat { margin: 0 var(--cx-space-1) 14px; }
.sidebar-heading { display: flex; justify-content: space-between; align-items: center; padding-left: 10px; color: var(--cx-text-muted); font-size: 11px; letter-spacing: 1px; }
.session-list { flex: 1; min-height: 0; overflow-y: auto; }
.sidebar-empty { padding: 10px; color: var(--cx-text-muted); font-size: 12px; line-height: 1.9; }
.session { display: flex; align-items: center; border-radius: 8px; margin: 3px 0; border: 1px solid transparent; &.active { background: color-mix(in srgb, var(--cx-color-primary) 8%, transparent); border-color: color-mix(in srgb, var(--cx-color-primary) 20%, transparent); } &:hover { background: rgba(255,255,255,.04); } }
.session-open { flex: 1; min-width: 0; text-align: left; padding: 11px 10px; color: var(--cx-text-primary); span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; } small { display: block; color: var(--cx-text-muted); font-size: 10px; margin-top: 5px; } }
button { font: inherit; cursor: pointer; }
.session-open,.session-delete,.sidebar-links button,.text-retry { border: 0; background: transparent; }
button:disabled { cursor: not-allowed; opacity: .5; }
button:focus-visible { outline: 2px solid var(--cx-color-primary); outline-offset: 2px; }
.session-delete { padding: var(--cx-space-2); color: var(--cx-text-muted); &:hover { color: #ef9a9a; } }
.text-retry { font-size: 12px; color: var(--cx-color-primary); padding: 10px; }
.sidebar-links { border-top: 1px solid var(--cx-border); padding: var(--cx-space-4) var(--cx-space-2) 0; > span { font-size: 11px; color: var(--cx-text-muted); } > div { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: var(--cx-space-3); } button { color: var(--cx-text-secondary); display: flex; align-items: center; gap: 5px; padding: 0; font-size: 11px; &:hover { color: var(--cx-color-primary); } } }
.desk-chat { min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--cx-border); border-radius: 16px; overflow: hidden; background: var(--cx-bg-card); }
.chat-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 10px; padding: 21px 28px; border-bottom: 1px solid var(--cx-border); background: color-mix(in srgb, var(--cx-color-primary) 2.5%, transparent); h1 { margin: 5px 0 0; font-size: 18px; font-weight: 500; letter-spacing: 1px; } }
.eyebrow { font-size: 9px; letter-spacing: 2.5px; color: var(--cx-color-primary); }
.desk-status { display: flex; align-items: center; gap: 7px; color: var(--cx-text-muted); font-size: 11px; white-space: nowrap; i { width: 6px; height: 6px; border-radius: 50%; background: #82af9b; &.busy { background: var(--cx-color-primary); animation: pulse 1.3s ease infinite; } } }
.login-hint { background: color-mix(in srgb, var(--cx-color-primary) 8%, transparent); color: var(--cx-text-secondary); padding: 9px 28px; font-size: 12px; display: flex; gap: var(--cx-space-3); align-items: center; flex-wrap: wrap; button { display: inline-flex; align-items: center; color: var(--cx-color-primary); border: none; padding: 0; background: none; } }
.messages { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 26px 28px; }
.welcome { min-height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 6px 0; max-width: 780px; margin: auto; h2 { font-family: 'STSong', 'Songti SC', serif; font-size: clamp(26px, 3vw, 37px); font-weight: 500; letter-spacing: 2px; margin: var(--cx-space-3) 0; color: var(--cx-text-primary); } > p { font-size: 13px; line-height: 1.8; color: var(--cx-text-secondary); margin: 0 0 22px; } > .service-scope { font-size: 11px; color: var(--cx-text-muted); margin: var(--cx-space-4) 0 0; } }
.welcome-ticket { color: var(--cx-color-primary); letter-spacing: 3px; font-size: 10px; }
.service-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
.service-card { position: relative; text-align: left; padding: 17px 14px; border: 1px solid var(--cx-border); border-radius: 10px; background: rgba(255,255,255,.015); transition: border-color .2s, transform .2s; color: var(--cx-text-primary); > .el-icon:first-child { color: var(--cx-color-primary); font-size: 21px; margin-bottom: 14px; } strong { display: block; font-weight: 500; font-size: 13px; margin-bottom: 6px; } > span:not(.el-icon) { color: var(--cx-text-muted); font-size: 10px; } .card-arrow { position: absolute; right: 13px; top: 18px; color: var(--cx-text-muted); font-size: 13px; } &:hover { border-color: var(--cx-color-primary); transform: translateY(-2px); } }
.message { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 22px; &.user { flex-direction: row-reverse; .message-role { text-align: right; } .bubble { background: color-mix(in srgb, var(--cx-color-primary) 13%, transparent); border-color: color-mix(in srgb, var(--cx-color-primary) 16%, transparent); } .message-avatar { background: color-mix(in srgb, var(--cx-color-primary) 12%, transparent); color: var(--cx-color-primary); border-color: color-mix(in srgb, var(--cx-color-primary) 20%, transparent); } } }
.message-avatar { flex: none; display: grid; place-items: center; width: 29px; height: 29px; border: 1px solid var(--cx-border); border-radius: 9px; font-size: 12px; color: var(--cx-text-secondary); margin-top: 23px; }
.message-body { min-width: 0; max-width: 89%; }
.message-role { display: block; font-size: 10px; color: var(--cx-text-muted); margin-bottom: 7px; }
.bubble { border: 1px solid var(--cx-border); border-radius: 0 12px 12px 12px; padding: 13px 17px; line-height: 1.85; font-size: 13px; overflow-wrap: anywhere; color: var(--cx-text-primary); background: rgba(255,255,255,.025); :deep(p) { margin: 0 0 9px; &:last-child { margin-bottom: 0; } } :deep(a) { color: var(--cx-color-primary); text-decoration: underline; text-underline-offset: 3px; } :deep(ul),:deep(ol) { padding-left: var(--cx-space-5); margin: var(--cx-space-2) 0; } :deep(pre) { overflow-x: auto; padding: var(--cx-space-3); background: rgba(0,0,0,.2); border-radius: 7px; } :deep(table) { display: block; overflow-x: auto; border-collapse: collapse; } :deep(th),:deep(td) { border: 1px solid var(--cx-border); padding: 5px 9px; } :deep(h1),:deep(h2),:deep(h3) { font-size: 15px; margin: var(--cx-space-3) 0 5px; } }
.message-notice { font-size: 11px; color: var(--cx-text-muted); margin: var(--cx-space-2) 0; &.error { color: #e6a88c; } button { margin-left: 10px; color: var(--cx-color-primary); border: none; background: none; } }
.thinking,.history-loading { color: var(--cx-text-muted); font-size: 12px; padding: var(--cx-space-4) 0; span { animation: pulse 1s infinite; } }
.action-section { padding-top: 15px; border-top: 1px dashed color-mix(in srgb, var(--cx-color-primary) 30%, transparent); margin-top: 26px; }
.action-heading { display: flex; gap: 10px; align-items: center; justify-content: space-between; h2 { font-size: 14px; font-weight: 500; margin: 0; span { font-size: 10px; color: var(--cx-color-primary); margin-left: var(--cx-space-2); } } }
.action-tip { font-size: 11px; color: var(--cx-text-muted); line-height: 1.7; margin: var(--cx-space-1) 0 14px; }
.action-card { border: 1px solid color-mix(in srgb, var(--cx-color-primary) 35%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--cx-color-primary) 3.5%, transparent); padding: 18px; margin-bottom: var(--cx-space-3); &.done { border-color: rgba(130,175,155,.3); } &.expired { border-color: var(--cx-border); background: transparent; } }
.action-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; strong { font-size: 13px; font-weight: 500; } span { font-size: 10px; color: var(--cx-color-primary); } }
.action-summary { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--cx-text-secondary); font-size: 12px; line-height: 1.9; }
.action-result { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #82af9b; line-height: 1.7; }
.action-buttons { display: flex; flex-wrap: wrap; gap: var(--cx-space-2); align-items: center; .el-button + .el-button { margin-left: 0; } small { font-size: 10px; color: var(--cx-text-muted); } }
.composer { flex: none; padding: 15px 25px var(--cx-space-3); border-top: 1px solid var(--cx-border); background: rgba(255,255,255,.015); }
.prompt-strip { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 11px; button { border: 1px solid var(--cx-border); background: transparent; color: var(--cx-text-secondary); font-size: 10px; padding: 5px 9px; border-radius: 20px; &:hover { border-color: var(--cx-color-primary); color: var(--cx-color-primary); } } }
.input-row { display: flex; align-items: flex-end; gap: 10px; :deep(.el-textarea__inner) { resize: none; font-size: 13px; padding: 10px var(--cx-space-3); line-height: 1.7; } }
.send-button { min-height: 40px; flex: none; }
.composer-footer { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 9px; color: var(--cx-text-muted); font-size: 9px; line-height: 1.5; }
@keyframes pulse { 50% { opacity: .35; } }
@media (max-width: 1100px) { .service-desk { grid-template-columns: 215px minmax(0,1fr); gap: var(--cx-space-3); } .chat-header,.messages { padding: var(--cx-space-5); } .service-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .service-card { padding: var(--cx-space-3); > .el-icon:first-child { margin-bottom: var(--cx-space-2); } } .welcome h2 { font-size: 28px; } .desk-status { font-size: 10px; } }
@media (max-width: 768px) { .service-desk { grid-template-columns: minmax(0,1fr); grid-template-rows: auto minmax(0,1fr); height: calc(100dvh - var(--cx-header-h) - 25px); min-height: 650px; padding-top: var(--cx-space-3); gap: 10px; } .desk-sidebar { padding: var(--cx-space-2); display: grid; grid-template-columns: auto minmax(0,1fr); gap: var(--cx-space-2); } .desk-brand,.sidebar-heading,.sidebar-links { display: none; } .new-chat { margin: 0; font-size: 11px; } .session-list { display: flex; gap: 5px; overflow-x: auto; overflow-y: hidden; } .sidebar-empty { margin: 0; padding: 2px 6px; font-size: 10px; } .session { flex: 0 0 125px; margin: 0; } .session-open { padding: 6px; small { display: none; } } .session-delete { padding: 5px; } .chat-header { padding: 14px var(--cx-space-4); h1 { font-size: 16px; } } .desk-status { display: none; } .messages { padding: 18px 14px; } .welcome { h2 { font-size: 26px; } > p { font-size: 12px; margin-bottom: 15px; } > .service-scope { font-size: 10px; } } .service-grid { gap: var(--cx-space-2); } .service-card { padding: var(--cx-space-3); > span:not(.el-icon) { font-size: 9px; } } .composer { padding: var(--cx-space-3); } .composer-footer > span:first-child { display: none; } .bubble { padding: 10px var(--cx-space-3); font-size: 12px; } .message-body { max-width: calc(100% - 35px); } .message-avatar { width: 25px; height: 25px; } .action-card { padding: 13px; } .login-hint { padding: var(--cx-space-2) var(--cx-space-4); font-size: 10px; } }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation: none !important; transition: none !important; } }

/* 多服务单：头部入口、数量汇总、待确认筛选与类型/状态标签 */
.header-side { display: flex; align-items: center; gap: 10px; }
.action-jump { color: var(--cx-color-primary); font-size: 11px; padding: 4px 8px; strong { margin: 0 3px; font-size: 13px; } span { color: var(--cx-text-muted); } }
.action-section { scroll-margin-top: 12px; }
.action-heading h2 {
  .action-total { margin-left: 8px; font-size: 10px; color: var(--cx-text-muted); font-weight: 400; }
  .action-pending { margin-left: 8px; font-size: 10px; color: var(--cx-color-primary); font-weight: 400; }
}
.action-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; button { border: 1px solid var(--cx-border); background: transparent; color: var(--cx-text-secondary); border-radius: 16px; padding: 4px 10px; font-size: 10px; cursor: pointer; &:hover { border-color: var(--cx-color-primary); color: var(--cx-color-primary); } &.active { border-color: var(--cx-color-primary); color: var(--cx-color-primary); background: color-mix(in srgb, var(--cx-color-primary) 10%, transparent); } } }
.action-empty { color: var(--cx-text-muted); font-size: 11px; padding: 8px 0; }
.action-warning { margin: 12px 0 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, #e6a88c 45%, transparent); border-radius: 8px; background: color-mix(in srgb, #e6a88c 8%, transparent); color: #e6a88c; font-size: 11px; line-height: 1.7; button { margin-left: 8px; border: 0; background: transparent; color: var(--cx-color-primary); cursor: pointer; font-size: 11px; text-decoration: underline; } }
.action-type { display: inline-block; margin-right: 6px; padding: 1px 6px; border: 1px solid color-mix(in srgb, var(--cx-color-primary) 35%, transparent); border-radius: 4px; color: var(--cx-color-primary); font-size: 9px; font-weight: 400; vertical-align: 1px; }
.action-status { font-size: 10px; color: var(--cx-color-primary); &.done { color: #82af9b; } &.inactive { color: var(--cx-text-muted); } }
.action-card { border-left-width: 2px; }
@media (max-width: 768px) { .header-side { gap: 6px; } .action-jump { font-size: 10px; span { display: none; } } .action-filters button { padding: 3px 8px; } }
</style>
