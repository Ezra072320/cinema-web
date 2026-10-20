/**
 * ECharts 暗色主题 — 与全站暗色风格一致.
 * 主色: 暖金(#c9a96e) / 酒红(#7c1d3f) / 辅助色板.
 */
import type { EChartsOption } from 'echarts';

export const CINEMA_DARK: EChartsOption = {
  backgroundColor: 'transparent',
  textStyle: {
    color: '#a1a1aa',
    fontFamily: 'Inter, PingFang SC, system-ui, sans-serif',
  },
  title: {
    textStyle: { color: '#f4f4f5', fontWeight: 600 },
    subtextStyle: { color: '#71717a' },
  },
  legend: {
    textStyle: { color: '#a1a1aa' },
  },
  tooltip: {
    backgroundColor: 'rgba(26, 31, 46, 0.96)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    textStyle: { color: '#f4f4f5' },
    extraCssText: 'backdrop-filter: blur(8px); box-shadow: 0 8px 32px rgba(0,0,0,0.32);',
  },
  grid: {
    // containLabel 保证 6 位数的金额轴标签不会被固定 48px 的左内边距裁掉
    left: 12,
    right: 24,
    top: 32,
    bottom: 32,
    containLabel: true,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
    axisLabel: { color: '#a1a1aa' },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
    axisTick: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
    axisLabel: { color: '#a1a1aa' },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
  },
  color: ['#c9a96e', '#7c1d3f', '#3b82f6', '#10b981', '#f59e0b', '#a78bfa', '#ef4444'],
};
