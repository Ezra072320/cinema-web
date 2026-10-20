<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuth } from '@/composables/useAuth';
import { useCaptcha } from '@/composables/useCaptcha';

/**
 * 管理员登录.
 * 验证码流同 UserLogin(useCaptcha): 前端生成 ticket → 后端按 ticket 出图 →
 * 登录请求体携带 captcha.payload(), 后端原子校验并消费.
 */
const route = useRoute();
const router = useRouter();
const { login } = useAuth();

const captcha = useCaptcha();
const { url: captchaUrl, available: captchaAvailable, code } = captcha;

const formRef = ref<FormInstance>();
const form = reactive({ name: '', password: '' });

const rules: FormRules = {
  name: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  // 验证码可用时必填; code 不在 form model 里, 校验函数直接读 ref
  captcha: [
    {
      validator: (_rule, _v, cb) =>
        !captchaAvailable.value || code.value.trim() ? cb() : cb(new Error('请输入验证码')),
      trigger: 'blur',
    },
  ],
};

const loading = ref(false);

async function submit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  const r = await login(
    {
      name: form.name,
      password: form.password,
      ...captcha.payload(),
    },
    'ADMIN',
  );
  loading.value = false;

  if (r.ok) {
    ElMessage.success('欢迎回来');
    const raw = (route.query.redirect as string) || '/manage/overview';
    router.replace(safeRedirect(raw, '/manage/overview'));
  } else {
    ElMessage.error(r.msg ?? '登录失败');
    captcha.refresh();
  }
}

/**
 * 防止开放重定向: 必须站内路径,且必须落在 admin 区域.
 * 拒绝 `//evil.com`、`http://...`; 拒绝 redirect=/main 绕开后台.
 */
function safeRedirect(target: string, fallback: string): string {
  if (!target || typeof target !== 'string') return fallback;
  if (!target.startsWith('/')) return fallback;
  if (target.startsWith('//')) return fallback;
  if (!target.startsWith('/manage')) return fallback;
  return target;
}
</script>

<template>
  <el-card class="auth-card cx-glass">
    <h2>管理员登录</h2>
    <p class="subtitle">仅供影院工作人员使用</p>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="submit"
    >
      <el-form-item label="账号" prop="name">
        <el-input v-model="form.name" placeholder="管理员账号" autocomplete="username" />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="密码"
          autocomplete="current-password"
          show-password
        />
      </el-form-item>

      <el-form-item v-if="captchaAvailable" label="验证码" prop="captcha">
        <div class="captcha">
          <el-input v-model="code" placeholder="不区分大小写" maxlength="6" autocomplete="off" />
          <img
            :src="captchaUrl"
            alt="点击刷新验证码"
            class="captcha-img"
            tabindex="0"
            role="button"
            @click="captcha.refresh"
            @keydown.enter="captcha.refresh"
            @keydown.space.prevent="captcha.refresh"
            @error="captcha.onImageError"
          />
        </div>
      </el-form-item>

      <el-button
        type="primary"
        size="large"
        :loading="loading"
        style="width: 100%"
        @click="submit"
      >
        登 录
      </el-button>

      <div class="links">
        <el-link :underline="false" href="/auth/login" @click.prevent="router.push('/auth/login')">
          ← 普通用户登录
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

.captcha {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  .el-input {
    flex: 1;
  }
  .captcha-img {
    cursor: pointer;
    height: 36px;
    width: 96px;
    border-radius: var(--cx-radius-sm);
    border: 1px solid var(--cx-border);
    background: rgba(255, 255, 255, 0.04);
    object-fit: cover;

    &:hover {
      border-color: var(--cx-color-primary);
    }
  }
}

.links {
  display: flex;
  justify-content: flex-start;
  margin-top: var(--cx-space-4);
}
</style>
