import js from '@eslint/js';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

/**
 * ESLint 扁平配置.
 *
 * 基线策略: 只抓**真问题**, 不管格式(格式归 Prettier, 见 .prettierrc).
 * - vue/essential: 仅错误级规则, 不含 max-attributes-per-line 等排版规则
 * - typescript-eslint/recommended: 关闭类型无关的常规规则集
 * - eslint-config-prettier 最后加载, 关掉与 Prettier 冲突的样式规则
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tests/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    // 浏览器全局(window/document/MouseEvent/...); 工具脚本再叠 node
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    rules: {
      // Home.vue / Movie.vue 等单词组件名是刻意的路由页命名
      'vue/multi-word-component-names': 'off',
      // 未使用变量: 警告不报错, `_` 前缀豁免
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  prettierConfig,
);
