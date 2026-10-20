<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Star, StarFilled } from '@element-plus/icons-vue';
import { userApi } from '@/api';

const props = defineProps<{ movieId: number; isWant: boolean }>();
const emit = defineEmits<{ (e: 'change', val: boolean): void }>();

const loading = ref(false);
async function toggle() {
  if (loading.value) return;
  loading.value = true;
  try {
    // 返回值 = 切换后的真实状态(true=现在想看), 驱动提示与按钮回显
    const next = await userApi.toggleWant(props.movieId);
    emit('change', next);
    ElMessage.success(next ? '已加入想看' : '已取消想看');
  } catch {
    // 业务/网络错误由 http 拦截器统一弹 toast(D8), 这里只兜 loading 复位
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-button
    :type="isWant ? 'default' : 'primary'"
    size="large"
    :loading="loading"
    round
    @click="toggle"
  >
    <el-icon><component :is="isWant ? StarFilled : Star" /></el-icon>
    <span style="margin-left: 6px">{{ isWant ? '已想看' : '想看' }}</span>
  </el-button>
</template>
