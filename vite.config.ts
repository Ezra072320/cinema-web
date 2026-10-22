import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      vue(),
      vueDevTools(),
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        // importStyle: false — 组件样式由 main.ts 的全量 index.css 统一提供,
        // resolver 再按需注入会在 dist 里产生双份 el-*.css 碎片块.
        resolvers: [ElementPlusResolver({ importStyle: false })],
        dts: false,
      }),
      Components({
        // 按需自动注册 src/components 下的全局复用组件(原 main.ts 手动 app.component),
        // 避免全部组件被打进首屏 index chunk.
        dirs: ['src/components'],
        resolvers: [ElementPlusResolver({ importStyle: false })],
        dts: false,
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_GATEWAY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          // 大依赖拆独立 chunk: 业务代码变更不连带 vendor 缓存失效, 且并行加载.
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            // element-plus 及 @element-plus/icons-vue
            if (id.includes('element-plus')) return 'vendor-element';
            // echarts / vue-echarts / echarts/*
            if (id.includes('echarts')) return 'vendor-echarts';
            // vue / vue-router / pinia / @vueuse (含 @vue/* 运行时与 vue-demi)
            if (
              /[\\/]node_modules[\\/](vue|vue-router|pinia|vue-demi)[\\/]/.test(id) ||
              /[\\/]node_modules[\\/]@vue(use)?[\\/]/.test(id)
            ) {
              return 'vendor-vue';
            }
          },
        },
      },
    },
  };
});
