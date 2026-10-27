<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { governanceApi, type SeatRule } from '@/api/governance';
const state = ref<SeatRule | null>(null);
const qps = ref(30);
const loading = ref(false);
const saving = ref(false);
const failed = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
async function load(reset = true) {
  loading.value = true;
  try {
    state.value = await governanceApi.state();
    failed.value = false;
    if (reset && state.value.configuredQps != null) qps.value = state.value.configuredQps;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const target = qps.value;
    if (timer) clearTimeout(timer);
    state.value = await governanceApi.save(target);
    ElMessage.success('规则已保存');
    let attempts = 0;
    const refresh = async () => {
      if (disposed) return;
      await load(false);
      if ((!state.value?.synchronizedRule || state.value?.configuredQps !== target) && ++attempts < 10) timer = setTimeout(refresh, 1000);
    };
    await refresh();
  } finally {
    saving.value = false;
  }
}
onMounted(() => load());
onBeforeUnmount(() => {
  disposed = true;
  if (timer) clearTimeout(timer);
});
</script>
<template>
  <section class="governance">
    <header>
      <div>
        <p class="eyebrow">服务治理</p>
        <h1>选座查询流控</h1>
      </div>
      <el-button :loading="loading" @click="load()">刷新状态</el-button>
    </header>
    <p class="intro">
      控制门户与 AI 查询座位图的请求速率。下单、支付继续使用原有业务准入与订单状态校验。
    </p>
    <el-alert v-if="failed" title="配置服务暂不可用，请稍后刷新" type="warning" :closable="false" />
    <el-alert
      v-else-if="state && !state.enabled"
      title="本地治理组尚未启动，当前使用基础配置"
      type="info"
      :closable="false"
    />
    <div v-if="state?.enabled" v-loading="loading" class="policy-layout">
      <el-card
        ><template #header
          ><div class="card-title">
            <span>持久规则</span
            ><el-tag :type="state.synchronizedRule ? 'success' : 'warning'">{{
              state.synchronizedRule ? '已生效' : '等待同步'
            }}</el-tag>
          </div></template
        >
        <el-form label-position="top" @submit.prevent="save"
          ><el-form-item label="每秒允许的查询数（QPS）"
            ><el-input-number v-model="qps" :min="1" :max="1000" :precision="0"
          /></el-form-item>
          <p class="hint">
            当前保存：{{ state.configuredQps ?? '未配置' }} · 当前生效：{{
              state.activeQps ?? '未配置'
            }}
          </p>
          <el-button type="primary" native-type="submit" :loading="saving"
            >保存并下发</el-button
          ></el-form
        >
      </el-card>
      <el-card
        ><template #header>规则来源与恢复</template>
        <p>规则保存到 Nacos，应用重启后重新加载。配置中心暂时中断时，已经加载的规则继续生效。</p>
        <p>
          Dashboard
          用于观察实时请求。请在此保存持久修改；控制台的临时修改会在配置更新或应用重启后被覆盖。
        </p>
        <p class="resource">
          资源：trade:seat-query<br />配置：CINEMA_GOVERNANCE / cinema-trade-seat-flow.json
        </p>
        <a href="http://127.0.0.1:18880" target="_blank" rel="noopener noreferrer"
          >打开本机 Sentinel 控制台 ↗</a
        ></el-card
      >
    </div>
  </section>
</template>
<style scoped>
.governance header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.governance h1 {
  margin: 6px 0 16px;
}
.eyebrow {
  font-size: 12px;
  color: var(--cx-color-primary);
  letter-spacing: 0.15em;
}
.intro,
.hint,
.policy-layout p {
  font-size: 13px;
  line-height: 1.9;
  color: var(--cx-text-secondary);
}
.policy-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
  margin-top: 24px;
}
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.resource {
  overflow-wrap: anywhere;
  font-family: monospace;
}
.policy-layout a {
  font-size: 13px;
  color: var(--cx-color-primary);
}
@media (max-width: 900px) {
  .policy-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
