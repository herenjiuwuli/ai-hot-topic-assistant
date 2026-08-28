<template>
  <div class="page trend-page">
    <div class="screen">
      <div class="screen-title">热点追踪 · 7 天趋势</div>

      <div class="toolbar">
        <div class="row">
          <select v-model="platform" class="input select">
            <option value="douyin">抖音</option>
            <option value="rednote">小红书</option>
            <option value="bili">B站</option>
          </select>
          <input
            v-model="keyword"
            placeholder="输入热词（建议与热榜标题一致）"
            class="input text-input"
            @keyup.enter="fetchTrend"
          />
          <button class="btn primary" :disabled="loading || !keyword.trim()" @click="fetchTrend">
            {{ loading ? '加载中...' : '查看趋势' }}
          </button>
        </div>
        <div class="row snapshot-row">
          <button class="btn secondary" :disabled="snapshotLoading" @click="saveSnapshot">
            {{ snapshotLoading ? '保存中...' : '保存今日快照' }}
          </button>
          <span v-if="snapshotMsg" :class="['snapshot-msg', snapshotMsgType]">{{ snapshotMsg }}</span>
        </div>
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>

      <div v-if="series.length > 0" class="chart-box">
        <canvas ref="chartCanvas"></canvas>
      </div>
      <div v-else-if="!loading && !error && searched" class="empty">
        <p>近 7 天无该热词数据，请先保存快照后再查看。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import { CHART } from '../theme.js'

Chart.register(...registerables)

const platform = ref('douyin')
const keyword = ref('')
const loading = ref(false)
const error = ref('')
const series = ref([])
const searched = ref(false)
const snapshotLoading = ref(false)
const snapshotMsg = ref('')
const snapshotMsgType = ref('success')

const chartCanvas = ref(null)
let chartInstance = null

function primaryColor() {
  return CHART.primary
}

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
}

async function fetchTrend() {
  const kw = keyword.value.trim()
  if (!kw) return

  loading.value = true
  error.value = ''
  searched.value = true
  destroyChart()

  try {
    const res = await fetch(`/api/trend?platform=${platform.value}&keyword=${encodeURIComponent(kw)}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    series.value = data.series || []
    await nextTickDraw()
  } catch (err) {
    error.value = err.message
    series.value = []
  } finally {
    loading.value = false
  }
}

async function nextTickDraw() {
  await new Promise((r) => setTimeout(r, 50))
  if (!chartCanvas.value || series.value.length === 0) return
  destroyChart()

  const ctx = chartCanvas.value.getContext('2d')
  const c = primaryColor()
  const gray = CHART.gray
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.value.map((s) => s.date),
      datasets: [
        {
          label: '热度',
          data: series.value.map((s) => s.hot),
          borderColor: c,
          backgroundColor: c + '1a',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: series.value.map((s) => (s.found ? c : gray)),
          pointBorderColor: series.value.map((s) => (s.found ? c : gray)),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true },
        x: { grid: { display: false } },
      },
    },
  })
}

async function saveSnapshot() {
  snapshotLoading.value = true
  snapshotMsg.value = ''
  try {
    const res = await fetch('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: platform.value }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    snapshotMsg.value = `已保存今日 ${platform.value === 'douyin' ? '抖音' : platform.value === 'rednote' ? '小红书' : 'B站'} 快照（${data.count} 条）`
    snapshotMsgType.value = 'success'
  } catch (err) {
    snapshotMsg.value = err.message
    snapshotMsgType.value = 'error'
  } finally {
    snapshotLoading.value = false
  }
}

onUnmounted(() => destroyChart())
</script>

<style scoped>
.snapshot-row { margin-top: 12px; }
.snapshot-msg { font-size: 13px; }
.snapshot-msg.success { color: var(--success); }
.snapshot-msg.error { color: var(--danger); }
</style>
