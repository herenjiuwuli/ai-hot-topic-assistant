import { ref } from 'vue'
import { Chart } from 'chart.js'

// 当前主题：'light' | 'dark'
export const theme = ref(
  typeof localStorage !== 'undefined' ? localStorage.getItem('theme') || 'light' : 'light'
)

function applyChartDefaults() {
  const dark = theme.value === 'dark'
  Chart.defaults.color = dark ? '#8b929c' : '#8a9099'
  Chart.defaults.borderColor = dark ? '#2a2e37' : '#eef0f3'
  Chart.defaults.font.family =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif'
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value)
  if (typeof localStorage !== 'undefined') localStorage.setItem('theme', theme.value)
  applyChartDefaults()
}

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme()
  // 通知图表组件重绘（颜色随主题变化）
  window.dispatchEvent(new CustomEvent('theme-changed'))
}

// 模块加载即应用一次（main.js 之前 index.html 已内联初始化，避免闪白）
applyTheme()
