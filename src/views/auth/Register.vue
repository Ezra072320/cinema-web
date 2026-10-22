<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuth } from '@/composables/useAuth';
import { useCaptcha } from '@/composables/useCaptcha';

const router = useRouter();
const { register } = useAuth();

const formRef = ref<FormInstance>();
const form = reactive({
  name: '',
  password: '',
  confirm: '',
  age: 18,
});

const captcha = useCaptcha();
const { url: captchaUrl, available: captchaAvailable, code } = captcha;
const loading = ref(false);

const rules: FormRules = {
  name: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { pattern: /^\S{2,16}$/, message: '昵称需为 2~16 个非空字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { pattern: /^\S{6,16}$/, message: '密码需为 6~16 个非空字符', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_, v: string, cb) =>
        v === form.password ? cb() : cb(new Error('两次输入不一致')),
      trigger: 'blur',
    },
  ],
  age: [
    { required: true, message: '请输入年龄', trigger: 'blur' },
    { type: 'number', min: 1, max: 120, message: '年龄需在 1~120 之间', trigger: 'blur' },
  ],
  // 表单项声明了 prop="captcha", 早先 rules 里却没有对应规则,
  // 校验 UI 与实际逻辑脱节(只在 submit 里手写判空).
  // code 不在 form model 里, 校验函数直接读 ref.
  captcha: [
    {
      validator: (_rule, _v, cb) =>
        !captchaAvailable.value || code.value.trim() ? cb() : cb(new Error('请输入验证码')),
      trigger: 'blur',
    },
  ],
};

async function submit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  const r = await register(
    {
      name: form.name,
      password: form.password,
      age: form.age,
      ...captcha.payload(),
    },
  );
  loading.value = false;

  if (r.ok) {
    ElMessage.success('注册成功,请登录');
    router.replace({ name: 'login', query: { redirect: '/main' } });
  } else {
    ElMessage.error(r.msg ?? '注册失败');
    captcha.refresh();
  }
}
</script>

<template>
  <el-card class="auth-card cx-glass">
    <h2>注册账号</h2>
    <p class="subtitle">加入猫头鹰影院,开启观影之旅</p>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item label="昵称" prop="name">
        <el-input v-model="form.name" placeholder="2~16 个字符" clearable />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="6~16 位"
          autocomplete="new-password"
          show-password
        />
      </el-form-item>

      <el-form-item label="确认密码" prop="confirm">
        <el-input
          v-model="form.confirm"
          type="password"
          placeholder="再次输入"
          autocomplete="new-password"
          show-password
        />
      </el-form-item>

      <el-form-item label="年龄" prop="age">
        <el-input-number v-model="form.age" :min="1" :max="120" />
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
            class="captcha-img"
            tabindex="0"
            role="button"
            @click="captcha.refresh()"
            @keydown.enter="captcha.refresh()"
            @keydown.space.prevent="captcha.refresh()"
            @error="captcha.onImageError()"
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
        注 册
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
