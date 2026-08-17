<template>
  <div class="page topics-page">
    <div class="screen">
      <div class="screen-title">生成选题 · AI 推荐</div>

      <div v-if="selectedTopic" class="sel-topic">
        <span class="label">已选话题</span>
        <span class="text">{{ selectedTopic }}</span>
        <button class="x" title="取消选中话题" @click="clearTopic">✕</button>
      </div>

      <div class="form">
        <div class="form-row">
          <select v-model="selectedPlatform" class="input select">
            <option value="douyin">抖音</option>
            <option value="rednote">小红书</option>
            <option value="bili">B站</option>
          </select>
          <input
            ref="inputRef"
            v-model="positioning"
            placeholder="输入账号定位，如：美食探店、数码评测、美妆穿搭..."
            class="input text-input"
            @keyup.enter="generateTopics"
          />
          <button class="btn primary" :disabled="loading" @click="generateTopics">
            {{ loading ? '生成中...' : '生成选题' }}
          </button>
        </div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <p v-if="!error && topics.length === 0" class="form-hint hint">
          输入你的账号定位后点击「生成选题」，AI 将{{ selectedTopic ? `围绕话题《${selectedTopic}》` : '结合当日热榜' }}为你推荐 5 个选题。
        </p>
      </div>

      <div v-if="topics.length > 0" class="results">
        <p class="hint result-hint">基于「{{ resultBasis }}」，为你推荐以下 5 个选题（点击卡片可放大查看细节）</p>
        <div class="cards">
          <TopicCard
            v-for="(topic, i) in topics"
            :key="i"
            :topic="topic"
            @save="saveTopic"
            @open="openDetail"
          />
        </div>
      </div>
    </div>

    <!-- 放大的选题卡细节 -->
    <TopicDetail
      v-if="detailTopic"
      :topic="detailTopic"
      @close="detailTopic = null"
      @save="saveTopic"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import TopicCard from '../components/TopicCard.vue'
import TopicDetail from '../components/TopicDetail.vue'

const route = useRoute()

const inputRef = ref(null)

const positioning = ref('')
const selectedTopic = ref('')
const selectedPlatform = ref('douyin')
const topics = ref([])
const loading = ref(false)
const error = ref('')
const detailTopic = ref(null)

// 结果提示里展示的定位/话题基准
const resultBasis = computed(() => {
  const base = positioning.value.trim() || '你的账号'
  return selectedTopic.value ? `${base} × 话题《${selectedTopic.value}》` : base
})

onMounted(() => {
  // 从热榜跳转时预填平台与选中的话题，不自动生成（需用户手动输入账号定位后点按钮）
  if (route.query.platform) selectedPlatform.value = route.query.platform
  if (route.query.topic) selectedTopic.value = String(route.query.topic)
  setTimeout(() => inputRef.value?.focus(), 100)
})

function clearTopic() {
  selectedTopic.value = ''
}

function openDetail(topic) {
  detailTopic.value = topic
}

async function generateTopics() {
  const pos = positioning.value.trim()
  if (!pos) {
    error.value = '请先输入账号定位'
    return
  }

  loading.value = true
  error.value = ''
  topics.value = []

  try {
    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positioning: pos,
        platform: selectedPlatform.value,
        topic: selectedTopic.value || undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    // 把当前平台写入每条选题，供保存/写内容/详情使用
    topics.value = (data.topics || []).map((t) => ({ ...t, platform: selectedPlatform.value }))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function saveTopic(topic) {
  try {
    const res = await fetch('/api/saved-topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...topic,
        platform: topic.platform || selectedPlatform.value,
        sourceTopic: topic.sourceTopic || selectedTopic.value,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || '保存失败')
    }
    alert('已保存到选题库')
  } catch (err) {
    alert(`保存失败：${err.message}`)
  }
}
</script>

<style scoped>
.cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
