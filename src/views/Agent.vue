<template>
  <div class="page agent-page">
    <div class="screen">
      <span class="screen-tag">Agent</span>
      <div class="screen-title">Agent 助手 · 一句话出结果</div>

      <div class="form">
        <div class="field">
          <label for="goal-input">你想让它做什么？</label>
          <textarea
            id="goal-input"
            v-model="goal"
            class="input goal-input"
            rows="3"
            placeholder="例如：为美食号从今日抖音热榜选 3 个选题，写一条脚本并保存排期"
          ></textarea>
        </div>
        <div class="form-row">
          <select v-model="platform" class="input select">
            <option value="douyin">抖音</option>
            <option value="rednote">小红书</option>
            <option value="bili">B站</option>
          </select>
          <button class="btn primary run-btn" :disabled="loading" @click="run">
            {{ loading ? '处理中...' : '开始' }}
          </button>
          <button v-if="loading" class="btn ghost run-btn" @click="abort">停止</button>
        </div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <p v-if="!error && !hasRun" class="hint">
          输入任务目标后点「开始」，Agent 会自动抓热榜、出选题、写内容、保存排期，直接给你结果。
        </p>
      </div>

      <!-- 运行中状态 -->
      <div v-if="loading" class="loading-status">
        <span class="ls-dot"></span>
        <span>Agent 正在处理，请稍候…</span>
      </div>

      <!-- 结果区：终答 + 结构化产物 -->
      <div v-if="done" class="result-area">
        <!-- 终答 -->
        <div class="screen result-card">
          <div class="result-title">✅ 完成</div>
          <p class="answer-text">{{ answer }}</p>
        </div>

        <!-- 热榜参考 -->
        <div v-if="artifacts.hotTopics?.length" class="screen">
          <div class="result-title">📈 参考热榜</div>
          <ul class="topic-list">
            <li v-for="(t, i) in artifacts.hotTopics" :key="i" class="topic-row">
              <span class="t-rank">{{ t.rank }}</span>
              <span class="t-title">{{ t.title }}</span>
              <span class="t-hot">{{ formatHot(t.hot) }}</span>
              <button
                v-if="!t.saved"
                class="btn small ghost save-mini"
                title="保存到选题库"
                @click="saveHotTopic(t)"
              >存</button>
              <span v-else class="saved-tick">✓</span>
            </li>
          </ul>
        </div>

        <!-- 参考角度 -->
        <div v-if="artifacts.references" class="screen">
          <div class="result-title">💡 切入角度参考</div>
          <ul class="ref-list">
            <li v-for="(g, i) in (artifacts.references.matches?.length ? artifacts.references.matches.map((m) => m.title) : artifacts.references.generic || [])" :key="i" class="ref-item">
              ▸ {{ g }}
            </li>
          </ul>
        </div>

        <!-- 脚本/文案卡 -->
        <div v-if="artifacts.scripts?.length" class="screen">
          <div class="result-title">✍️ 生成的{{ artifacts.scripts.length > 1 ? '内容' : (artifacts.scripts[0].type === 'copy' ? '文案' : '脚本') }}</div>
          <div v-for="(s, i) in artifacts.scripts" :key="i" class="script-card">
            <div class="script-head">
              <span class="script-title">{{ s.title }}</span>
              <span class="script-type">{{ s.type === 'copy' ? '文案' : '脚本' }}</span>
              <button
                class="btn small primary save-script-btn"
                :disabled="s.saved"
                @click="saveScript(s)"
              >{{ s.saved ? '已保存 ✓' : '保存到选题库' }}</button>
            </div>
            <p class="script-content">{{ s.content }}</p>
          </div>
        </div>

        <!-- 自动保存提示 -->
        <div v-if="autoSaved" class="screen saved-box">
          <div class="result-title">📚 已自动保存</div>
          <p class="saved-line">✓ {{ autoSaved.title }}（Agent 忘了保存，系统帮你补上了）</p>
        </div>

        <!-- 排期表 -->
        <div v-if="artifacts.schedule?.length" class="screen">
          <div class="result-title">🗓 发布排期建议</div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>日期</th><th>时段</th><th>说明</th></tr>
              </thead>
              <tbody>
                <tr v-for="(s, i) in artifacts.schedule" :key="i">
                  <td>{{ s.date }}</td>
                  <td>{{ s.slot }}</td>
                  <td class="s-note">{{ s.note || '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 已保存 -->
        <div v-if="artifacts.savedItems?.length" class="screen saved-box">
          <div class="result-title">📚 已保存到选题库</div>
          <p v-for="(s, i) in artifacts.savedItems" :key="i" class="saved-line">
            ✓ {{ s.title }}
          </p>
        </div>

        <!-- 处理过程（默认隐藏，给好奇的人看） -->
        <details class="process-details">
          <summary>查看处理过程（开发者）</summary>
          <TrajectoryStep v-for="(step, i) in trajectory" :key="i" :step="step" :index="i" />
        </details>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TrajectoryStep from '../components/TrajectoryStep.vue'

const goal = ref('')
const platform = ref('douyin')
const loading = ref(false)
const error = ref('')
const hasRun = ref(false)
const done = ref(false)
const answer = ref('')
const artifacts = ref({})
const trajectory = ref([])
const autoSaved = ref(null)

let abortCtrl = null

async function run() {
  const text = goal.value.trim()
  if (!text) {
    error.value = '请先输入任务目标'
    return
  }

  loading.value = true
  error.value = ''
  hasRun.value = true
  done.value = false
  answer.value = ''
  artifacts.value = {}
  trajectory.value = []
  autoSaved.value = null
  abortCtrl = new AbortController()

  try {
    const res = await fetch('/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: text, platform: platform.value }),
      signal: abortCtrl.signal,
    })
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    await consumeStream(res.body.getReader())
  } catch (err) {
    if (err.name === 'AbortError') {
      error.value = '已手动停止'
    } else {
      error.value = err.message
      hasRun.value = false
    }
  } finally {
    loading.value = false
    abortCtrl = null
  }
}

function abort() {
  abortCtrl?.abort()
}

// 解析 SSE 流：event: xxx\ndata: {...}\n\n
async function consumeStream(reader) {
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done: streamDone, value } = await reader.read()
    if (streamDone) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      handleFrame(frame)
    }
  }
}

function handleFrame(frame) {
  let event = 'message'
  let dataStr = ''
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7)
    else if (line.startsWith('data: ')) dataStr += line.slice(6)
  }
  if (!dataStr) return

  let payload
  try {
    payload = JSON.parse(dataStr)
  } catch {
    return
  }

  if (event === 'step') {
    trajectory.value.push(payload) // 只记录，不在结果区展示
  } else if (event === 'done') {
    answer.value = payload.answer || ''
    artifacts.value = payload.artifacts || {}
    autoSaved.value = payload.autoSaved || null
    done.value = true
    if (!answer.value && !trajectory.value.length) {
      answer.value = '（Agent 没有返回内容，请换个说法重试）'
      done.value = true
    }
  } else if (event === 'error') {
    throw new Error(payload.error || 'Agent 执行失败')
  }
}

// —— 手动保存到选题库（不依赖 Agent 自觉，直接调保存接口）——
async function saveScript(script) {
  try {
    await saveToLibrary({
      title: script.title,
      angle: '',
      why: '来自 Agent 生成',
      tags: [],
      platform: platform.value,
    })
    script.saved = true
  } catch (err) {
    alert(`保存失败：${err.message}`)
  }
}

async function saveHotTopic(topic) {
  try {
    await saveToLibrary({
      title: topic.title,
      angle: '',
      why: '来自实时热榜',
      tags: [],
      platform: platform.value,
      sourceTopic: topic.title,
    })
    topic.saved = true
  } catch (err) {
    alert(`保存失败：${err.message}`)
  }
}

async function saveToLibrary(record) {
  const res = await fetch('/api/saved-topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function formatHot(n) {
  if (n == null) return ''
  if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
  return String(n)
}
</script>

<style scoped>
.goal-input {
  resize: vertical;
  min-height: 76px;
  border-radius: 14px; /* 方框：覆盖全局胶囊圆角，只影响本页 */
}
.form-row .select {
  flex: 0 0 120px;
  border-radius: 14px;
}
.run-btn { min-width: 100px; }
code {
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}

/* 运行中 */
.loading-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 0 6px;
  color: var(--text-2);
  font-size: 14px;
}
.ls-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary);
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.25; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.15); }
}

/* 结果区 */
.result-area { margin-top: 20px; }
.result-card { background: var(--primary-soft); border-color: var(--primary-soft-2); }
.result-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}
.answer-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 热榜列表 */
.topic-list { list-style: none; margin: 0; padding: 0; }
.topic-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-bottom: 1px dashed var(--border-soft);
}
.topic-row:last-child { border-bottom: none; }
.t-rank {
  width: 22px;
  text-align: center;
  font-weight: 700;
  color: var(--primary);
  flex-shrink: 0;
}
.t-title { flex: 1; min-width: 0; font-size: 14px; color: var(--text); }
.t-hot { font-size: 12px; color: var(--text-3); flex-shrink: 0; }
.save-mini { padding: 2px 10px; font-size: 12px; flex-shrink: 0; }
.saved-tick { color: var(--success); font-weight: 700; flex-shrink: 0; }

/* 参考角度 */
.ref-list { list-style: none; margin: 0; padding: 0; }
.ref-item {
  font-size: 13px;
  color: var(--text-2);
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-soft);
}
.ref-item:last-child { border-bottom: none; }

/* 脚本卡 */
.script-card {
  background: var(--surface-2);
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.script-card:last-child { margin-bottom: 0; }
.script-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.script-title { font-size: 14px; font-weight: 600; color: var(--text); flex: 1; min-width: 0; }
.script-type {
  font-size: 11px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 1px 8px;
  border-radius: 999px;
  flex-shrink: 0;
}
.save-script-btn { flex-shrink: 0; }
.script-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 排期 */
.s-note { color: var(--text-3); font-size: 12px; }

/* 已保存 */
.saved-box { background: var(--success-soft); border-color: rgba(76, 175, 80, 0.3); }
.saved-line { font-size: 13px; color: var(--success); font-weight: 500; margin: 4px 0; }

/* 过程折叠 */
.process-details {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-3);
}
.process-details summary {
  cursor: pointer;
  padding: 8px 0;
  user-select: none;
}
.process-details summary:hover { color: var(--primary); }
</style>
