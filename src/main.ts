import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
// 官方暗色变量打底: 未引入时 el-select 选项 / 下拉菜单 / 日期面板的 hover
// 仍是浅色默认值(近白底), 与暗色 UI 冲突.
import 'element-plus/theme-chalk/dark/css-vars.css';
import App from './App.vue';
import router from '@/router';
import pinia from '@/stores';

import '@/styles/theme.scss';

const app = createApp(App);
app.use(pinia);
app.use(router);
app.use(ElementPlus, { locale: zhCn });

app.mount('#app');
