import { Chart } from 'chart.js'

// Tropical Paradise 固定暖色图表配置（本风格只有浅色主题，无深色模式）
export const CHART = {
  primary: '#00897b', // 蓝绿主色
  warning: '#ffc107', // 芒果黄
  coral: '#ff6f61', // 珊瑚红
  palm: '#4caf50', // 棕榈绿
  gray: '#c0c4cc', // 弱化点（未命中日期）
  grid: '#e7f2ee',
  text: '#8a9a97',
}

export function applyChartDefaults() {
  Chart.defaults.color = CHART.text
  Chart.defaults.borderColor = CHART.grid
  Chart.defaults.font.family =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
}

// 模块加载即应用一次
applyChartDefaults()
