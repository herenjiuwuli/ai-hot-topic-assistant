<template>
  <div class="page review-page">
    <div class="screen">
      <div class="screen-title">数据复盘 · 效果对比</div>

      <!-- 表单 -->
      <div class="form">
        <h3 class="form-title">{{ editing ? '编辑记录' : '新增记录' }}</h3>
        <div class="form-row">
          <input v-model="form.title" placeholder="选题标题" class="input flex-1" />
          <select v-model="form.platform" class="input select">
            <option value="douyin">抖音</option>
            <option value="rednote">小红书</option>
            <option value="bili">B站</option>
          </select>
          <input v-model.number="form.views" type="number" placeholder="播放量" class="input num-input" />
          <input v-model.number="form.likes" type="number" placeholder="点赞量" class="input num-input" />
          <input v-model="form.date" type="date" class="input date-input" />
          <button class="btn primary" :disabled="saving || !form.title.trim()" @click="save">
            {{ saving ? '保存中...' : '保存' }}
          </button>
          <button v-if="editing" class="btn cancel" @click="cancelEdit">取消</button>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
      </div>

      <!-- 批量导入 -->
      <div class="batch-import">
        <button class="btn ghost small" @click="showBatch = !showBatch">
          {{ showBatch ? '收起' : '📥 批量导入' }}
        </button>
        <div v-if="showBatch" class="batch-body">
          <textarea
            v-model="batchText"
            placeholder="每行一条，支持格式：标题,播放量,点赞数,日期(YYYY-MM-DD)
或直接粘贴 CSV/制表符分隔，首行可为表头"
            class="batch-textarea"
            rows="6"
          ></textarea>
          <div class="row">
            <select v-model="batchPlatform" class="input select">
              <option value="douyin">抖音</option>
              <option value="rednote">小红书</option>
              <option value="bili">B站</option>
            </select>
            <button class="btn primary" :disabled="!batchText.trim()" @click="parseAndPreview">
              解析并预览
            </button>
          </div>
          <div v-if="previewItems.length > 0" class="preview-table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>播放量</th>
                  <th>点赞量</th>
                  <th>日期</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in previewItems" :key="i">
                  <td>{{ item.title }}</td>
                  <td>{{ item.views }}</td>
                  <td>{{ item.likes }}</td>
                  <td>{{ item.date }}</td>
                </tr>
              </tbody>
            </table>
            <button class="btn primary" :disabled="bulkLoading" @click="confirmImport">
              {{ bulkLoading ? '导入中...' : `确认导入 ${previewItems.length} 条` }}
            </button>
          </div>
          <p v-if="bulkMsg" :class="['bulk-msg', bulkMsgType]">{{ bulkMsg }}</p>
        </div>
      </div>

      <p v-if="loadError" class="error-msg">{{ loadError }}</p>

      <!-- 图表 -->
      <div v-if="list.length > 0" class="chart-box">
        <canvas ref="chartCanvas"></canvas>
      </div>

      <!-- 表格 -->
      <div v-if="list.length > 0" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>选题标题</th>
              <th>平台</th>
              <th>播放量</th>
              <th>点赞量</th>
              <th>日期</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in list" :key="item.id">
              <td>{{ item.title }}</td>
              <td>{{ item.platform === 'douyin' ? '抖音' : item.platform === 'rednote' ? '小红书' : 'B站' }}</td>
              <td>{{ item.views?.toLocaleString() }}</td>
              <td>{{ item.likes?.toLocaleString() }}</td>
              <td>{{ item.date }}</td>
              <td class="actions">
                <button class="btn-link" @click="startEdit(item)">编辑</button>
                <button class="btn-link danger" @click="remove(item.id)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="!loadError" class="empty">
        <p>暂无复盘记录，添加一条吧。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { Chart, registerables } from 'chart.js'
import { CHART } from '../theme.js'

Chart.register(...registerables)

const route = useRoute()

const list = ref([])
const loadError = ref('')
const saving = ref(false)
const formError = ref('')
const editing = ref(false)
const editId = ref('')

const form = ref({ title: '', platform: 'douyin', views: 0, likes: 0, date: '' })

const chartCanvas = ref(null)
let chartInstance = null

const savedId = ref('')

const showBatch = ref(false)
const batchText = ref('')
const batchPlatform = ref('douyin')
const previewItems = ref([])
const bulkLoading = ref(false)
const bulkMsg = ref('')
const bulkMsgType = ref('success')

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
}

function resetForm() {
  form.value = { title: '', platform: 'douyin', views: 0, likes: 0, date: '' }
  editing.value = false
  editId.value = ''
  formError.value = ''
}

function startEdit(item) {
  editing.value = true
  editId.value = item.id
  form.value = {
    title: item.title,
    platform: item.platform,
    views: item.views,
    likes: item.likes,
    date: item.date || '',
  }
}

function cancelEdit() {
  resetForm()
}

function parseNum(val) {
  if (val == null) return 0
  const s = String(val).trim().toLowerCase()
  if (!s) return 0
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (isNaN(n)) return 0
  if (s.includes('亿')) return Math.round(n * 1e8)
  if (s.includes('万') || s.includes('w')) return Math.round(n * 1e4)
  return Math.round(n)
}

const HEADER_KEYWORDS = ['标题', '名称', 'title', '播放', 'view', '点赞', '喜欢', 'like', '日期', 'date', '时间']

function parsePasted(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l)
  if (lines.length === 0) return []

  const first = lines[0].toLowerCase()
  const hasHeader = HEADER_KEYWORDS.some((kw) => first.includes(kw))
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map((line) => {
    const parts = line.split(/[,\t]|  +/).map((p) => p.trim()).filter((p) => p)
    const item = { title: parts[0] || '', views: 0, likes: 0, date: '', platform: batchPlatform.value }
    if (parts.length >= 2) item.views = parseNum(parts[1])
    if (parts.length >= 3) item.likes = parseNum(parts[2])
    if (parts.length >= 4) item.date = parts[3]
    return item
  }).filter((item) => item.title)
}

function parseAndPreview() {
  previewItems.value = parsePasted(batchText.value)
  bulkMsg.value = ''
}

async function confirmImport() {
  if (previewItems.length === 0) return
  bulkLoading.value = true
  bulkMsg.value = ''
  try {
    const res = await fetch('/api/reviews/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: previewItems.value.map((item) => ({ ...item, platform: batchPlatform.value })) }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    bulkMsg.value = `已导入 ${data.count} 条`
    bulkMsgType.value = 'success'
    previewItems.value = []
    batchText.value = ''
    await fetchList()
  } catch (err) {
    bulkMsg.value = err.message
    bulkMsgType.value = 'error'
  } finally {
    bulkLoading.value = false
  }
}

async function fetchList() {
  try {
    const res = await fetch('/api/reviews')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    list.value = await res.json()
    await nextTickDraw()
  } catch (err) {
    loadError.value = err.message
  }
}

async function save() {
  if (!form.value.title.trim()) return
  saving.value = true
  formError.value = ''
  try {
    const url = editing.value ? `/api/reviews/${editId.value}` : '/api/reviews'
    const method = editing.value ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    if (savedId.value) {
      await fetch(`/api/saved-topics/${savedId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed' }),
      }).catch(() => {})
      savedId.value = ''
    }
    resetForm()
    await fetchList()
  } catch (err) {
    formError.value = err.message
  } finally {
    saving.value = false
  }
}

async function remove(id) {
  if (!confirm('确认删除该记录？')) return
  try {
    const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    await fetchList()
  } catch (err) {
    loadError.value = err.message
  }
}

async function nextTickDraw() {
  await nextTick()
  if (!chartCanvas.value || list.value.length === 0) return
  destroyChart()

  const c = CHART.primary
  const w = CHART.warning

  const labels = list.value.map((r) => r.title)
  const viewsData = list.value.map((r) => r.views || 0)
  const likesData = list.value.map((r) => r.likes || 0)

  const ctx = chartCanvas.value.getContext('2d')
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '播放量', data: viewsData, backgroundColor: c + 'b3', borderRadius: 4 },
        { label: '点赞量', data: likesData, backgroundColor: w + 'b3', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true } },
    },
  })
}

onMounted(() => {
  if (route.query.title) form.value.title = route.query.title
  if (route.query.platform) form.value.platform = route.query.platform
  if (route.query.savedId) savedId.value = route.query.savedId
  fetchList()
})
onUnmounted(() => destroyChart())
</script>

<style scoped>
.form { margin-bottom: 16px; }
.form-title { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 12px; }
.num-input { width: 110px; }
.date-input { width: 160px; }
.batch-import { margin-bottom: 16px; }
.batch-body {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px; margin-top: 8px;
}
.bulk-msg { font-size: 13px; margin-top: 8px; }
.bulk-msg.success { color: var(--success); }
.bulk-msg.error { color: var(--danger); }
</style>
