<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuth } from '@/composables/useAuth';
import { useCaptcha } from '@/composables/useCaptcha';

/**
 * 用户登录.
 *
 * 验证码流(票据制 + 一次性原子校验)见 useCaptcha:
 * ticket 出图 → 提交时 captcha.payload() 带上 captchaTicket + captchaCode,
 * 后端原子校验并消费; 端点未实现则静默降级.
 */
const route = useRoute();
const router = useRouter();
const { login } = useAuth();

const captcha = useCaptcha();
const { url: captchaUrl, available: captchaAvailable, code } = captcha;

const formRef = ref<FormInstance>();
const form = reactive({
  name: '',
  password: '',
});

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
  // 把 captcha 一起随登录请求提交,后端原子校验
  const r = await login(
    {
      name: form.name,
      password: form.password,
      ...captcha.payload(),
    },
    'USER',
  );
  loading.value = false;

  if (r.ok) {
    ElMessage.success('登录成功');
    const raw = (route.query.redirect as string) || '/main';
    router.replace(safeRedirect(raw));
  } else {
    ElMessage.error(r.msg ?? '登录失败');
    // 失败时一律刷新验证码(可能过期、也可能被滥用)
    captcha.refresh();
  }
}

/** 防止开放重定向: 拒绝 `//evil.com` / `http://...` / `javascript:` 等. */
function safeRedirect(target: string): string {
  if (!target || typeof target !== 'string') return '/main';
  if (!target.startsWith('/')) return '/main';
  if (target.startsWith('//')) return '/main';
  return target;
}
</script>

<template>
  <el-card class="auth-card cx-glass">
    <h2>用户登录</h2>
    <p class="subtitle">欢迎回到猫头鹰影院</p>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="submit"
    >
      <el-form-item label="账号" prop="name">
        <el-input
          v-model="form.name"
          placeholder="请输入昵称"
          autocomplete="username"
          clearable
        />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="请输入密码"
          autocomplete="current-password"
          show-password
        />
      </el-form-item>

      <el-form-item v-if="captchaAvailable" label="验证码" prop="captcha">
        <div class="captcha">
          <el-input
            v-model="code"
            placeholder="不区分大小写"
            maxlength="6"
            autocomplete="off"
          />
          <img
            :src="captchaUrl"
            alt="点击刷新验证码"
            role="button"
            tabindex="0"
            class="captcha-img"
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
        <el-link
          type="primary"
          :underline="false"
          href="/auth/register"
          @click.prevent="router.push('/auth/register')"
        >
          注册新账号
        </el-link>
        <el-link
          :underline="false"
          href="/auth/reset"
          @click.prevent="router.push('/auth/reset')"
        >
          忘记密码
        </el-link>
      </div>

      <el-divider class="or">
        <span class="or-text">或</span>
      </el-divider>

      <el-button
        text
        class="admin-link"
        @click="router.push('/auth/adminLogin')"
      >
        管理员登录 →
      </el-button>
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
    letter-spacing: -0.01em;
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
    font-weight: 500;
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
    outline: none;

    &:focus-visible {
      outline: 2px solid var(--cx-color-primary);
    }

    &:hover {
      border-color: var(--cx-color-primary);
    }
  }
}

.links {
  display: flex;
  justify-content: space-between;
  margin-top: var(--cx-space-4);
}

.or {
  margin: var(--cx-space-5) 0 var(--cx-space-3);

  .or-text {
    font-size: 12px;
    color: var(--cx-text-muted);
    letter-spacing: 0.1em;
  }
}

.admin-link {
  width: 100%;
  color: var(--cx-text-secondary);

  &:hover {
    color: var(--cx-color-primary);
  }
}
</style>
