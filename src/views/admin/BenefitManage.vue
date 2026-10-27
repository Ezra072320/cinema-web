<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { benefitApi, type CouponTemplate } from '@/api/benefit';
import { useAuthStore } from '@/stores/auth';
const auth = useAuthStore();
const rows = ref<CouponTemplate[]>([]);
const busy = ref(false);
const failed = ref(false);
const form = reactive({ name: '', discount: 10, minimum: 50, stock: 100, validDays: 7 });
async function load() {
  failed.value = false;
  try {
    rows.value = await benefitApi.adminTemplates();
  } catch {
    failed.value = true;
  }
}
async function create() {
  if (!form.name.trim() || form.discount >= form.minimum) {
    ElMessage.warning('填写券名称，且优惠金额必须小于使用门槛');
    return;
  }
  busy.value = true;
  try {
    await benefitApi.create({ ...form, name: form.name.trim() });
    ElMessage.success('优惠券已发布');
    form.name = '';
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section class="benefit-manage">
    <h1>优惠券管理</h1>
    <p>发布满减观影券，每位用户每个活动限领一张。已支付订单退票后不返券。</p>
    <el-card v-if="auth.can('benefit:write')"
      ><el-form label-position="top" class="coupon-form" @submit.prevent="create"
        ><el-form-item label="活动名称"
          ><el-input
            v-model="form.name"
            maxlength="80"
            placeholder="例如：周末观影礼" /></el-form-item
        ><el-form-item label="优惠金额（元）"
          ><el-input-number
            v-model="form.discount"
            :min="0.01"
            :max="9999.99"
            :precision="2" /></el-form-item
        ><el-form-item label="使用门槛（元）"
          ><el-input-number
            v-model="form.minimum"
            :min="0.01"
            :max="99999.99"
            :precision="2" /></el-form-item
        ><el-form-item label="发放数量"
          ><el-input-number v-model="form.stock" :min="1" :max="10000" /></el-form-item
        ><el-form-item label="领取后有效天数"
          ><el-input-number v-model="form.validDays" :min="1" :max="365" /></el-form-item
        ><el-button type="primary" :loading="busy" native-type="submit"
          >发布优惠券</el-button
        ></el-form
      ></el-card
    >
    <el-alert v-if="failed" title="优惠券服务暂不可用" type="warning" :closable="false" /><el-button
      class="refresh"
      @click="load"
      >刷新活动</el-button
    >
    <el-table :data="rows"
      ><el-table-column prop="name" label="活动名称" min-width="180" /><el-table-column
        prop="discount"
        label="优惠金额" /><el-table-column prop="minimum" label="使用门槛" /><el-table-column
        prop="remaining"
        label="剩余数量" /><el-table-column prop="validDays" label="有效天数"
    /></el-table>
  </section>
</template>
<style scoped>
.benefit-manage > p {
  color: #929bad;
  line-height: 1.8;
}
.coupon-form {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 16px;
}
.coupon-form .el-form-item {
  margin-bottom: 0;
}
.coupon-form .el-button {
  margin-top: 12px;
}
.refresh {
  margin: 20px 0;
}
</style>
