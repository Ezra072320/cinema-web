<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const { resetPassword } = useAuth();

const formRef = ref<FormInstance>();
const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirm: '',
});
const loading = ref(false);

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 24, message: '长度 6~24 位', trigger: 'blur' },
    {
      validator: (_, v: string, cb) =>
        v !== form.oldPassword ? cb() : cb(new Error('新密码不能与旧密码相同')),
      trigger: 'blur',
    },
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_, v: string, cb) =>
        v === form.newPassword ? cb() : cb(new Error('两次输入不一致')),
      trigger: 'blur',
    },
  ],
};

async function submit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  const r = await resetPassword({
    oldPassword: form.oldPassword,
    newPassword: form.newPassword,
  });
  loading.value = false;

  if (r.ok) {
    ElMessage.success('密码已更新,请使用新密码登录');
    router.replace('/auth/login');
  } else {
    ElMessage.error(r.msg ?? '修改失败');
  }
}
</script>

<template>
  <el-card class="auth-card cx-glass">
    <h2>修改密码</h2>
    <p class="subtitle">需要验证当前密码；忘记密码请联系影院管理员</p>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item label="当前密码" prop="oldPassword">
        <el-input
          v-model="form.oldPassword"
          type="password"
          autocomplete="current-password"
          show-password
        />
      </el-form-item>

      <el-form-item label="新密码" prop="newPassword">
        <el-input
          v-model="form.newPassword"
          type="password"
          placeholder="6~24 位"
          autocomplete="new-password"
          show-password
        />
      </el-form-item>

      <el-form-item label="确认新密码" prop="confirm">
        <el-input
          v-model="form.confirm"
          type="password"
          autocomplete="new-password"
          show-password
        />
      </el-form-item>

      <el-button
        type="primary"
        size="large"
        :loading="loading"
        style="width: 100%"
        @click="submit"
      >
        提 交
      </el-button>

      <div class="links">
        <el-link :underline="false" href="/auth/login" @click.prevent="router.push('/auth/login')">
          ← 返回登录
        </el-link>
      </div>
    </el-form>
  </el-card>
</template>

<style scoped lang="scss">
.auth-card {
  /* 固定 400px + 父级 overflow:hidden, 在 375px 手机上两侧被裁且无法横向滚动 */
  width: min(400px, 100%);
  padding: var(--cx-space-6);
  z-index: 1;

  :deep(.el-card__body) {
    padding: 0;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 24px;
    font-weight: 700;
    color: var(--cx-text-primary);
  }

  .subtitle {
    margin: 0 0 var(--cx-space-5);
    color: var(--cx-text-secondary);
    font-size: 13px;
  }

  :deep(.el-form-item__label) {
    color: var(--cx-text-secondary);
    font-size: 13px;
  }
}

.links {
  display: flex;
  justify-content: flex-start;
  margin-top: var(--cx-space-4);
}
</style>
