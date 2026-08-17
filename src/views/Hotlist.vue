<template>
  <div class="page hotlist-page">
    <div class="screen">
      <div class="screen-title">今日热榜 · 灵感池</div>

      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab-btn', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="activeTab === 'bili'" class="bili-filter">
        <select v-model="biliZoneId" class="input select" @change="fetchBiliZone">
          <option value="0">全站</option>
          <option value="1">动画</option>
          <option value="4">游戏</option>
          <option value="3">音乐</option>
          <option value="181">影视</option>
          <option value="201">知识</option>
          <option value="188">科技</option>
          <option value="21">生活</option>
        </select>
        <span v-if="currentZoneName" class="zone-name">{{ currentZoneName }}</span>
      </div>

      <div class="search">
        <span class="ico">🔍</span>
        <input v-model="searchKeyword" placeholder="搜索当前平台热榜…" />
      </div>

      <!-- 订阅提醒条 -->
      <div v-if="subscriptionMatchCount > 0 && !dismissedSubAlert" class="notice sub-alert">
        <span class="sub-alert-text">🔔 今日 {{ subscriptionMatchCount }} 条热榜命中你的订阅：{{ matchedKeywords }}</span>
        <button class="sub-alert-close" @click="dismissedSubAlert = true">✕</button>
      </div>

      <!-- 订阅面板 -->
      <div class="sub-panel">
        <button class="btn ghost small" @click="showSubPanel = !showSubPanel">
          {{ showSubPanel ? '收起' : '🔔 我的订阅' }}
        </button>
        <div v-if="showSubPanel" class="sub-body">
          <div class="sub-add-row">
            <input
              v-model="subKeyword"
              placeholder="输入关键词，如：AI、鸿蒙…"
              class="input sub-input"
              @keyup.enter="addSub"
            />
            <button class="btn primary small" :disabled="!subKeyword.trim()" @click="addSub">添加</button>
          </div>
          <div v-if="subscriptions.length > 0" class="sub-list">
            <div v-for="s in subscriptions" :key="s.id" class="sub-item">
              <span class="sub-keyword">{{ s.keyword }}</span>
              <button class="sub-del" @click="removeSub(s.id)">✕</button>
            </div>
          </div>
          <p v-else class="sub-empty">暂无订阅，输入关键词后点击「添加」</p>
        </div>
      </div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else>
        <div v-if="fromCache" class="cache-hint">
          <span class="cache-ico">⚠️</span>
          <span class="cache-text">数据来自本地缓存（接口暂时不可用）</span>
          <span v-if="retrying" class="cache-retry">
            正在自动重试{{ retryCount > 0 ? `（第 ${retryCount} 次）` : '' }}…
          </span>
          <button class="btn ghost small retry-now" @click="retryNow">立即重试</button>
        </div>

        <a
          v-for="item in filteredList"
          :key="item.rank"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          :class="['list-item', { 'sub-matched': isSubMatched(item) }]"
        >
          <span v-if="isSubMatched(item)" class="sub-badge">🔔</span>
          <span class="rank" :class="rankClass(item.rank)">{{ item.rank }}</span>
          <span v-if="item.zone" class="zone-tag">{{ item.zone }}</span>
          <span class="title">{{ item.title }}</span>
          <span class="hot">{{ formatHot(item.hot) }}</span>
          <button
            class="btn ghost small"
            @click.prevent="router.push({ path: '/topics', query: { platform: activeTab, topic: item.title } })"
          >
            生成选题
          </button>
        </a>

        <div v-if="searchKeyword && filteredList.length === 0" class="empty-search">
          未找到包含"{{ searchKeyword }}"的热榜
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const tabs = [
  { key: 'douyin', label: '抖音' },
  { key: 'rednote', label: '小红书' },
  { key: 'bili', label: 'B站' },
]

const biliZones = {
  0: '全站', 1: '动画', 4: '游戏', 3: '音乐', 181: '影视', 201: '知识', 188: '科技', 21: '生活',
}

const activeTab = ref('douyin')
const biliZoneId = ref(0)
const searchKeyword = ref('')
const items = ref([])
const loading = ref(false)
const error = ref('')
const fromCache = ref(false)

// 接口不可用（命中本地缓存）时自动重试
const retrying = ref(false)
const retryCount = ref(0)
let retryTimer = null
const RETRY_INTERVAL = 8000 // 每 8 秒重试一次

function stopAutoRetry() {
  retrying.value = false
  if (retryTimer) {
    clearInterval(retryTimer)
    retryTimer = null
  }
}

function startAutoRetry() {
  if (retryTimer) return
  retrying.value = true
  retryTimer = setInterval(async () => {
    if (loading.value) return // 避免请求重叠
    retryCount.value += 1
    await fetchHotlist(activeTab.value)
    if (!fromCache.value) stopAutoRetry() // 接口恢复，停止重试
  }, RETRY_INTERVAL)
}

function retryNow() {
  if (loading.value) return
  retryCount.value += 1
  fetchHotlist(activeTab.value)
}

const currentZoneName = computed(() => biliZones[biliZoneId.value])

// 订阅
const showSubPanel = ref(false)
const subKeyword = ref('')
const subscriptions = ref([])
const dismissedSubAlert = ref(false)

async function fetchSubscriptions() {
  try {
    const res = await fetch('/api/subscriptions')
    if (res.ok) subscriptions.value = await res.json()
  } catch { /* silent */ }
}

async function addSub() {
  const kw = subKeyword.value.trim()
  if (!kw) return
  try {
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: kw }),
    })
    if (res.ok) {
      const data = await res.json()
      subscriptions.value.push(data)
      subKeyword.value = ''
    }
  } catch { /* silent */ }
}

async function removeSub(id) {
  try {
    await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' })
    subscriptions.value = subscriptions.value.filter((s) => s.id !== id)
  } catch { /* silent */ }
}

function isSubMatched(item) {
  return subscriptions.value.some((s) => item.title.includes(s.keyword))
}

const subscriptionMatchCount = computed(() => items.value.filter((item) => isSubMatched(item)).length)

const matchedKeywords = computed(() => {
  const matched = new Set()
  for (const item of items.value) {
    for (const s of subscriptions.value) {
      if (item.title.includes(s.keyword)) matched.add(s.keyword)
    }
  }
  return Array.from(matched).join('、')
})

const filteredList = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw) return items.value
  return items.value.filter((item) => {
    const title = item.title.toLowerCase()
    const tags = (item.tags || []).join(' ').toLowerCase()
    const zone = (item.zone || '').toLowerCase()
    return title.includes(kw) || tags.includes(kw) || zone.includes(kw)
  })
})

async function fetchHotlist(platform) {
  loading.value = true
  error.value = ''
  fromCache.value = false
  try {
    const res = await fetch(`/api/hotlist?platform=${platform}`)
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `HTTP ${res.status}`)
    }
    const data = await res.json()
    items.value = data.items || []
    fromCache.value = !!data.fromCache
    if (fromCache.value) startAutoRetry()
    else { stopAutoRetry(); retryCount.value = 0 }
    dismissedSubAlert.value = false
  } catch (err) {
    error.value = err.message
    items.value = []
  } finally {
    loading.value = false
  }
}

async function fetchBiliZone() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/bili-zone?rid=${biliZoneId.value}`)
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `HTTP ${res.status}`)
    }
    const data = await res.json()
    items.value = data.items || []
    dismissedSubAlert.value = false
  } catch (err) {
    error.value = err.message
    items.value = []
  } finally {
    loading.value = false
  }
}

// 防抖：同一平台 30 秒内不重复请求
let fetchTimer = null
let lastFetchedPlatform = null
let lastFetchTime = 0
const CACHE_TTL = 30 * 1000

watch(activeTab, (val) => {
  if (fetchTimer) clearTimeout(fetchTimer)
  searchKeyword.value = ''
  const now = Date.now()
  if (lastFetchedPlatform === val && (now - lastFetchTime) < CACHE_TTL) return
  fetchTimer = setTimeout(() => {
    fetchHotlist(val)
    lastFetchedPlatform = val
    lastFetchTime = Date.now()
  }, 200)
}, { immediate: true })

onMounted(() => fetchSubscriptions())
onUnmounted(stopAutoRetry)

function formatHot(val) {
  if (val >= 1e8) return (val / 1e8).toFixed(1) + '亿'
  if (val >= 1e4) return (val / 1e4).toFixed(1) + '万'
  return String(val)
}

function rankClass(rank) {
  if (rank <= 3) return 'top'
  return ''
}
</script>
