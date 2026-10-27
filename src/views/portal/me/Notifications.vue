<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Bell, Check, Refresh, ArrowRight } from '@element-plus/icons-vue';
import { notificationApi, notificationSocketUrl, type NotificationItem } from '@/api/notifications';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const items = ref<NotificationItem[]>([]);
const unread = ref(0);
const total = ref(0);
const page = ref(1);
const onlyUnread = ref(false);
const loading = ref(false);
const error = ref(false);
const marking = ref(false);
const live = ref(false);
let disposed = false;
let requestVersion = 0;
let socket: WebSocket | undefined;
let reconnect: ReturnType<typeof setTimeout> | undefined;
let polling: ReturnType<typeof setInterval> | undefined;
let connectionAttempts = 0;

async function load(showLoading = true) {
  const version = ++requestVersion;
  if (showLoading) loading.value = true;
  try {
    const [result, count] = await Promise.all([
      notificationApi.list(page.value, onlyUnread.value),
      notificationApi.unread(),
    ]);
    if (disposed || version !== requestVersion) return;
    items.value = result.rows;
    total.value = result.total;
    unread.value = count;
    error.value = false;
  } catch {
    if (!disposed && version === requestVersion) error.value = true;
  } finally {
    if (!disposed && version === requestVersion) loading.value = false;
  }
}

async function connect() {
  if (disposed || !auth.token || error.value || connectionAttempts >= 3) return;
  connectionAttempts++;
  try {
    const ticket = await notificationApi.ticket();
    if (disposed || !auth.token) return;
    socket = new WebSocket(notificationSocketUrl(ticket));
    socket.onmessage = (message) => {
      if (disposed) return;
      try {
        const event = JSON.parse(message.data);
        if (event.type === 'notifications.connected') {
          live.value = true;
          connectionAttempts = 0;
          void load(false);
        } else if (event.type === 'notifications.changed') void load(false);
      } catch {
        /* Unknown push frames do not change stored notifications. */
      }
    };
    socket.onclose = () => {
      live.value = false;
      if (!disposed && auth.token) reconnect = setTimeout(() => void connect(), 5000);
    };
  } catch {
    live.value = false;
    if (!disposed && connectionAttempts < 3) reconnect = setTimeout(() => void connect(), 5000);
  }
}

async function refresh() {
  await load();
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    connectionAttempts = 0;
    await connect();
  }
}

async function open(item: NotificationItem) {
  try {
    if (!item.readAt) await notificationApi.read(item.id);
  } catch {
    /* Failed read markers can be retried; order navigation remains available. */
  } finally {
    await router.push(`/order/${item.orderId}`);
  }
}

async function markAll() {
  marking.value = true;
  try {
    await notificationApi.readAll();
    await load(false);
  } catch {
    /* The shared HTTP handler displays the error; keep current messages for retry. */
  } finally {
    marking.value = false;
  }
}

watch([onlyUnread, page], () => void load());
watch(onlyUnread, () => {
  page.value = 1;
});
onMounted(async () => {
  await load();
  await connect();
  polling = setInterval(() => {
    if (!document.hidden && !error.value && auth.token) void load(false);
  }, 30_000);
});
onUnmounted(() => {
  disposed = true;
  requestVersion++;
  clearTimeout(reconnect);
  clearInterval(polling);
  socket?.close();
});
</script>

<template>
  <section class="messages" aria-label="消息通知">
    <header class="messages-heading">
      <div>
        <span class="eyebrow">我的影院动态</span>
        <h1>
          消息通知 <span v-if="unread" class="unread-total">{{ unread }} 条未读</span>
        </h1>
        <p>购票、支付与退款的办理结果，都留在这里。</p>
      </div>
      <span class="update-status" :class="{ live }">{{ live ? '实时更新中' : '可手动刷新' }}</span>
    </header>

    <div class="messages-toolbar">
      <el-radio-group v-model="onlyUnread" aria-label="筛选通知">
        <el-radio-button :value="false">全部消息</el-radio-button>
        <el-radio-button :value="true">仅看未读</el-radio-button>
      </el-radio-group>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
        <el-button :icon="Check" :loading="marking" :disabled="unread === 0" @click="markAll"
          >全部已读</el-button
        >
      </div>
    </div>

    <div v-if="error" class="message-placeholder" role="alert">
      <el-icon :size="28"><Bell /></el-icon>
      <h2>消息暂时未能加载</h2>
      <p>请稍后重试，已办理的业务可在“我的订单”中查询。</p>
      <el-button @click="refresh">重新加载</el-button>
    </div>
    <div v-else-if="loading && !items.length" class="message-placeholder">
      <el-skeleton :rows="5" animated />
    </div>
    <div v-else-if="!items.length" class="message-placeholder">
      <el-icon :size="32"><Bell /></el-icon>
      <h2>{{ onlyUnread ? '消息都已读完' : '还没有新的消息' }}</h2>
      <p>
        {{
          onlyUnread ? '新的办理结果会继续出现在这里。' : '下单或办理售后后，我们会在这里通知你。'
        }}
      </p>
    </div>
    <ol v-else class="message-list" :aria-busy="loading">
      <li v-for="item in items" :key="item.id" class="message" :class="{ unread: !item.readAt }">
        <span class="message-marker" aria-hidden="true"
          ><el-icon><Bell /></el-icon
        ></span>
        <div class="message-copy">
          <div class="message-title">
            <h2>{{ item.title }}</h2>
            <span v-if="!item.readAt" class="unread-label">未读</span>
          </div>
          <p>{{ item.body }}</p>
          <time :datetime="item.createdAt">{{ item.createdAt.replace('T', ' ').slice(0, 19) }}</time>
        </div>
        <el-button text class="order-link" @click="open(item)"
          >查看订单<el-icon><ArrowRight /></el-icon
        ></el-button>
      </li>
    </ol>
    <el-pagination
      v-if="total > 20"
      v-model:current-page="page"
      :page-size="20"
      :total="total"
      layout="prev, pager, next"
    />
  </section>
</template>

<style scoped lang="scss">
.messages {
  min-width: 0;
}
.messages-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}
.eyebrow {
  color: var(--cx-color-primary);
  font-size: 12px;
  letter-spacing: 0.12em;
}
h1 {
  margin: 8px 0 10px;
  color: var(--cx-text-primary);
  font-size: 28px;
  letter-spacing: -0.03em;
}
.messages-heading p {
  margin: 0;
  color: var(--cx-text-muted);
  font-size: 13px;
  line-height: 1.7;
}
.unread-total {
  margin-left: 8px;
  font-size: 12px;
  color: var(--cx-color-primary);
  font-weight: 500;
  white-space: nowrap;
}
.update-status {
  white-space: nowrap;
  color: var(--cx-text-muted);
  font-size: 11px;
  padding-top: 6px;
}
.update-status.live {
  color: var(--cx-success);
}
.update-status::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 6px;
  border-radius: 50%;
  background: currentColor;
}
.messages-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--cx-border);
}
.toolbar-actions {
  display: flex;
  gap: 8px;
}
.toolbar-actions .el-button + .el-button {
  margin-left: 0;
}
.message-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
}
.message {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  padding: 25px 0;
  border-bottom: 1px solid var(--cx-border);
}
.message-marker {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--cx-border);
  border-radius: 10px;
  color: var(--cx-text-muted);
}
.message.unread .message-marker {
  color: var(--cx-color-primary);
  border-color: color-mix(in srgb, var(--cx-color-primary) 35%, transparent);
  background: color-mix(in srgb, var(--cx-color-primary) 8%, transparent);
}
.message-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.message-title h2 {
  margin: 0;
  font-size: 15px;
  color: var(--cx-text-primary);
  font-weight: 600;
}
.unread-label {
  font-size: 10px;
  color: var(--cx-color-primary);
}
.message-copy p {
  margin: 8px 0 12px;
  color: var(--cx-text-secondary);
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.message-copy time {
  color: var(--cx-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.order-link {
  padding: 0;
  margin-top: 2px;
  color: var(--cx-color-primary);
  font-size: 12px;
}
.message-placeholder {
  padding: 65px 20px;
  text-align: center;
  color: var(--cx-text-muted);
  border-bottom: 1px solid var(--cx-border);
}
.message-placeholder h2 {
  color: var(--cx-text-primary);
  font-size: 17px;
  font-weight: 500;
  margin-top: 18px;
}
.message-placeholder p {
  font-size: 13px;
  line-height: 1.8;
}
@media (max-width: 600px) {
  .messages-heading {
    flex-wrap: wrap;
    gap: 8px;
  }
  h1 {
    font-size: 25px;
  }
  .message {
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 12px;
    padding: 22px 0;
  }
  .message-marker {
    width: 30px;
    height: 30px;
  }
  .order-link {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
