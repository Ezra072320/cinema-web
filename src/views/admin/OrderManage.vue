<script setup lang="ts">
import { reactive, ref } from 'vue';
import { orderApi } from '@/api';
import { useTablePage } from '@/composables/useTablePage';
import { ORDER_STATUS_NUM, type OrderInfo } from '@/types';

const filter = reactive({ status: undefined as number | undefined, keyword: '' });

const { list, total, loading, page, limit, load, search } = useTablePage<OrderInfo>((page, limit) =>
  orderApi.adminPage({
    page,
    limit,
    status: filter.status,
    keyword: filter.keyword || undefined,
  }),
);

/** 只读详情抽屉: 管理员核对一笔订单时需要看到座位、支付渠道、退款与时间信息. */
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<OrderInfo | null>(null);

async function openDetail(row: OrderInfo) {
  detail.value = row;
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await orderApi.detail(row.id);
  } catch {
    // 详情接口失败时保留列表行数据, 不让抽屉空掉
  } finally {
    detailLoading.value = false;
  }
}

function payChannelLabel(c?: string) {
  if (!c) return '—';
  return ({ WECHAT: '微信', ALIPAY: '支付宝', CARD: '银行卡' } as Record<string, string>)[c] ?? c;
}

function timeText(v?: string) {
  return v ? v.replace('T', ' ').slice(0, 16) : '—';
}

function statusInfo(o: OrderInfo) {
  const s = Number(o.status);
  return {
    label: ORDER_STATUS_NUM[s] ?? '未知',
    type: s === 2 || s === 6 ? 'success' : s === 1 ? 'warning' : 'info',
  };
}
</script>

<template>
  <div class="order-manage">
    <header class="header">
      <h1 class="title">订单管理</h1>
      <p class="subtitle">共 {{ total }} 个订单</p>
    </header>

    <div class="filters cx-glass">
      <el-input
        v-model="filter.keyword"
        placeholder="按订单号 / 影片搜索"
        clearable
        style="width: 240px"
        @change="search"
      />
      <el-select
        v-model="filter.status"
        placeholder="状态"
        clearable
        style="width: 140px"
        @change="search"
      >
        <el-option :value="1" label="待支付" />
        <el-option :value="2" label="已支付" />
        <el-option :value="3" label="已退款" />
        <el-option :value="4" label="已关闭" />
        <el-option :value="6" label="已完成" />
      </el-select>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-card class="table-card cx-glass">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="number" label="订单号" />
        <el-table-column prop="movieName" label="影片" />
        <el-table-column prop="hallName" label="影厅" />
        <el-table-column prop="startTime" label="开映时间" width="180" />
        <el-table-column prop="totalAmount" label="金额" width="100">
          <template #default="{ row }">¥{{ row.totalAmount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusInfo(row).type" effect="dark">
              {{ statusInfo(row).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :page-size="limit"
        :total="total"
        layout="total, prev, pager, next, jumper"
        class="pager"
        @current-change="load"
      />
    </el-card>

    <el-drawer v-model="detailVisible" title="订单详情" size="min(460px, 92vw)">
      <div v-loading="detailLoading" class="detail">
        <template v-if="detail">
          <div class="detail-head">
            <div>
              <h3>{{ detail.movieName || '—' }}</h3>
              <p class="sub">订单号 {{ detail.number }}</p>
            </div>
            <el-tag :type="statusInfo(detail).type" effect="dark">
              {{ statusInfo(detail).label }}
            </el-tag>
          </div>

          <img
            v-if="detail.poster"
            :src="detail.poster"
            :alt="detail.movieName || '影片海报'"
            class="poster"
          />

          <dl class="fields">
            <div><dt>影厅</dt><dd>{{ detail.hallName || '—' }}</dd></div>
            <div><dt>开映时间</dt><dd>{{ timeText(detail.startTime) }}</dd></div>
            <div><dt>座位</dt><dd>{{ (detail.seatLabels || []).join(' / ') || '—' }}</dd></div>
            <div><dt>支付渠道</dt><dd>{{ payChannelLabel(detail.payChannel) }}</dd></div>
            <div><dt>订单金额</dt><dd class="amount">¥{{ detail.totalAmount.toFixed(2) }}</dd></div>
            <div v-if="detail.refundAmount != null">
              <dt>退款金额</dt><dd>¥{{ detail.refundAmount.toFixed(2) }}</dd>
            </div>
            <div v-if="detail.refundTime"><dt>退款时间</dt><dd>{{ timeText(detail.refundTime) }}</dd></div>
            <div><dt>下单时间</dt><dd>{{ timeText(detail.createTime) }}</dd></div>
          </dl>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.order-manage {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
}

.header {
  .title {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .subtitle {
    color: var(--cx-text-muted);
    font-size: 13px;
    margin: 4px 0 0;
  }
}

.filters {
  display: flex;
  /* 窄屏换行, 不让筛选控件被挤出视口 */
  flex-wrap: wrap;
  gap: var(--cx-space-3);
  padding: var(--cx-space-3) var(--cx-space-4);
  border-radius: var(--cx-radius-lg);
}

.table-card {
  padding: var(--cx-space-4);
}

.pager {
  margin-top: var(--cx-space-4);
}

.detail {
  display: flex;
  flex-direction: column;
  gap: var(--cx-space-4);
  min-height: 120px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cx-space-3);

  h3 {
    margin: 0 0 4px;
    font-size: 17px;
    color: var(--cx-text-primary);
  }
  .sub {
    margin: 0;
    font-size: 12px;
    color: var(--cx-text-muted);
    font-family: var(--cx-font-mono);
  }
}

.poster {
  width: 96px;
  border-radius: var(--cx-radius-md);
  display: block;
}

.fields {
  margin: 0;
  display: flex;
  flex-direction: column;

  > div {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: var(--cx-space-3);
    padding: 9px 0;
    border-bottom: 1px dashed var(--cx-border);
  }
  dt {
    color: var(--cx-text-muted);
    font-size: 12px;
  }
  dd {
    margin: 0;
    color: var(--cx-text-secondary);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .amount {
    color: var(--cx-color-primary);
    font-weight: 600;
  }
}
</style>
