<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { benefitApi, type Coupon, type CouponTemplate } from '@/api/benefit';
const coupons = ref<Coupon[]>([]);
const templates = ref<CouponTemplate[]>([]);
const loading = ref(false);
const error = ref(false);
const claiming = ref<number | null>(null);
const labels: Record<string, string> = {
  AVAILABLE: '可使用',
  FROZEN: '订单占用中',
  USED: '已核销',
  EXPIRED: '已过期',
};
async function load() {
  loading.value = true;
  error.value = false;
  try {
    [coupons.value, templates.value] = await Promise.all([
      benefitApi.coupons(),
      benefitApi.templates(),
    ]);
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
async function claim(id: number) {
  if (claiming.value != null) return;
  claiming.value = id;
  try {
    await benefitApi.claim(id);
    ElMessage.success('优惠券已放入券包');
    await load();
  } finally {
    claiming.value = null;
  }
}
onMounted(load);
</script>
<template>
  <section v-loading="loading" class="coupon-page">
    <div class="coupon-heading">
      <div>
        <p class="eyebrow">观影好礼</p>
        <h2>我的优惠券</h2>
      </div>
      <el-button @click="load">刷新券包</el-button>
    </div>
    <p class="policy">选座下单时选择优惠券。取消或超时后自动释放；支付后核销，退票不返券。</p>
    <el-alert
      v-if="error"
      title="优惠券服务暂不可用，请稍后重试"
      type="warning"
      :closable="false"
    />
    <div v-else class="coupon-grid">
      <article
        v-for="coupon in coupons"
        :key="coupon.id"
        class="coupon"
        :class="{ muted: coupon.status !== 'AVAILABLE' }"
      >
        <div class="coupon-value">
          <small>¥</small>{{ Number(coupon.discount).toFixed(2) }}<span>观影抵扣</span>
        </div>
        <div class="coupon-detail">
          <h3>{{ coupon.name }}</h3>
          <p>满 ¥{{ Number(coupon.minimum).toFixed(2) }} 可用</p>
          <small>有效期至 {{ coupon.expiresAt.replace('T', ' ').slice(0, 16) }}</small
          ><el-tag size="small" :type="coupon.status === 'AVAILABLE' ? 'success' : 'info'">{{
            labels[coupon.status] || coupon.status
          }}</el-tag
          ><RouterLink v-if="coupon.orderId" :to="`/order/${coupon.orderId}`"
            >查看关联订单</RouterLink
          >
        </div>
      </article>
      <p v-if="!coupons.length" class="policy">券包空空，领取下方观影好礼后再去选座。</p>
    </div>
    <h3 class="section-title">领券中心</h3>
    <div class="coupon-grid">
      <article v-for="t in templates" :key="t.id" class="claim-card">
        <div>
          <h3>{{ t.name }}</h3>
          <p>满 ¥{{ t.minimum }} 减 ¥{{ t.discount }} · 领取后 {{ t.validDays }} 天有效</p>
          <small>剩余 {{ t.remaining }} 张</small>
        </div>
        <el-button
          type="primary"
          plain
          :disabled="t.remaining <= 0"
          :loading="claiming === t.id"
          @click="claim(t.id)"
          >领取</el-button
        >
      </article>
      <p v-if="!templates.length && !error" class="policy">暂时没有可领取的优惠券。</p>
    </div>
  </section>
</template>
<style scoped lang="scss">
.coupon-page {
  min-width: 0;
}
.coupon-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
h2 {
  font-size: 26px;
  margin: 4px 0 16px;
}
.eyebrow {
  color: var(--cx-primary, #e4bc75);
  font-size: 12px;
  letter-spacing: 0.2em;
  margin: 0;
}
.policy {
  color: var(--cx-text-secondary, #a3a9b8);
  line-height: 1.8;
  font-size: 13px;
}
.coupon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 16px;
  margin-top: 24px;
}
.coupon {
  display: flex;
  border: 1px solid #c49b5544;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(110deg, #c49b5515, transparent);
  min-width: 0;
}
.coupon-value {
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  justify-content: center;
  width: 100px;
  flex-shrink: 0;
  color: #e4bc75;
  font-size: 30px;
  font-family: Georgia, serif;
  border-right: 1px dashed #c49b5555;
  padding: 18px 4px;
}
.coupon-value small {
  font-size: 20px;
  margin-top: 10px;
}
.coupon-value span {
  width: 100%;
  font-size: 11px;
  letter-spacing: 0.15em;
  text-align: center;
  margin-top: 8px;
}
.coupon-detail {
  padding: 18px;
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.coupon-detail h3,
.claim-card h3 {
  max-width: 100%;
  margin: 0;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.coupon-detail p {
  margin: 0;
  font-size: 13px;
}
.coupon-detail small,
.claim-card small {
  font-size: 11px;
  color: #939baa;
}
.coupon-detail a {
  font-size: 12px;
  color: #e4bc75;
}
.muted {
  filter: saturate(0.25);
  opacity: 0.7;
}
.section-title {
  margin-top: 38px;
  font-size: 18px;
}
.claim-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  border: 1px solid #ffffff12;
  border-radius: 12px;
  background: #ffffff03;
}
.claim-card p {
  line-height: 1.8;
  font-size: 12px;
  color: #a3a9b8;
}
.claim-card > div { min-width: 0; }
</style>
