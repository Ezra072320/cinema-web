/**
 * ECharts 按需注册 —— 全站只注册这一份.
 *
 * 之前 Overview / Revenue 各自 use([...]), 组件清单还不一致
 * (Overview 漏了 AriaComponent, 读屏用户拿不到图表的 aria 描述).
 * 新增图表页从这里 import VChart, 不要在自己的文件里再 use().
 */
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  AriaComponent,
} from 'echarts/components';

use([
  CanvasRenderer,
  BarChart,
  LineChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  AriaComponent,
]);

export { VChart };
