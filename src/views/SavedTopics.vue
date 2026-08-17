<template>
  <div class="page saved-page">
    <div class="screen">
      <div class="screen-title">选题库 · 保存→发布→复盘闭环</div>

      <!-- 闭环流程说明 -->
      <div class="flow-bar">
        <div class="flow-step"><span class="flow-dot">1</span>保存选题</div>
        <span class="flow-arrow">→</span>
        <div class="flow-step"><span class="flow-dot">2</span>标记发布</div>
        <span class="flow-arrow">→</span>
        <div class="flow-step"><span class="flow-dot">3</span>复盘数据</div>
      </div>

      <p v-if="loadError" class="text-error load-error">{{ loadError }}</p>

      <!-- 三栏闭环看板 -->
      <div v-if="list.length > 0" class="board">
        <!-- 待发布 -->
        <section class="board-col col-saved">
          <div class="board-head">
            <span class="board-dot"></span>
            <span class="name">待发布</span>
            <span class="board-count">{{ savedList.length }}</span>
          </div>
          <div class="board-body">
            <div v-for="item in savedList" :key="item.id" class="board-card">
              <div class="bc-title">{{ item.title }}</div>
              <div v-if="item.sourceTopic" class="bc-source">来源：<b>{{ item.sourceTopic }}</b></div>
              <div class="board-meta">
                <span class="tag gray">{{ platformText(item.platform) }}</span>
                <span class="meta-date">{{ item.createdAt?.slice(0, 10) }}</span>
              </div>
              <div class="board-actions">
                <button class="btn ghost-success small" @click="markStatus(item.id, 'published')">✅ 标记发布</button>
                <button class="btn-link danger" @click="remove(item.id)">删除</button>
              </div>
            </div>
            <p v-if="savedList.length === 0" class="board-empty">暂无</p>
          </div>
        </section>

        <!-- 已发布 -->
        <section class="board-col col-pub">
          <div class="board-head">
            <span class="board-dot"></span>
            <span class="name">已发布</span>
            <span class="board-count">{{ publishedList.length }}</span>
          </div>
          <div class="board-body">
            <div v-for="item in publishedList" :key="item.id" class="board-card">
              <div class="bc-title">{{ item.title }}</div>
              <div v-if="item.sourceTopic" class="bc-source">来源：<b>{{ item.sourceTopic }}</b></div>
              <div class="board-meta">
                <span class="tag gray">{{ platformText(item.platform) }}</span>
                <span class="meta-date">{{ item.createdAt?.slice(0, 10) }}</span>
              </div>
              <div class="board-actions">
                <button class="btn ghost small" @click="goReview(item)">➡️ 去复盘</button>
                <button class="btn ghost-warning small" @click="markStatus(item.id, 'reviewed')">📊 已复盘</button>
                <button class="btn-link danger" @click="remove(item.id)">删除</button>
              </div>
            </div>
            <p v-if="publishedList.length === 0" class="board-empty">暂无</p>
          </div>
        </section>

        <!-- 已复盘 -->
        <section class="board-col col-rev">
          <div class="board-head">
            <span class="board-dot"></span>
            <span class="name">已复盘</span>
            <span class="board-count">{{ reviewedList.length }}</span>
          </div>
          <div class="board-body">
            <div v-for="item in reviewedList" :key="item.id" class="board-card">
              <div class="bc-title">{{ item.title }}</div>
              <div v-if="item.sourceTopic" class="bc-source">来源：<b>{{ item.sourceTopic }}</b></div>
              <div class="board-meta">
                <span class="tag gray">{{ platformText(item.platform) }}</span>
                <span class="meta-date">{{ item.createdAt?.slice(0, 10) }}</span>
              </div>
              <div class="board-actions">
                <span class="reviewed-tag">✓ 已闭环</span>
                <button class="btn-link danger" @click="remove(item.id)">删除</button>
              </div>
            </div>
            <p v-if="reviewedList.length === 0" class="board-empty">暂无</p>
          </div>
        </section>
      </div>

      <div v-else-if="!loadError" class="empty-state">
        <p>选题库为空，先去「生成选题」页面保存一些吧。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const list = ref([])
const loadError = ref('')

const savedList = computed(() => list.value.filter((i) => i.status === 'saved'))
const publishedList = computed(() => list.value.filter((i) => i.status === 'published'))
const reviewedList = computed(() => list.value.filter((i) => i.status === 'reviewed'))

async function fetchList() {
  try {
    const res = await fetch('/api/saved-topics')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    list.value = await res.json()
  } catch (err) {
    loadError.value = err.message
  }
}

async function markStatus(id, status) {
  try {
    const res = await fetch(`/api/saved-topics/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) throw new Error('操作失败')
    await fetchList()
  } catch (err) {
    loadError.value = err.message
  }
}

function platformText(platform) {
  return platform === 'douyin' ? '抖音' : platform === 'rednote' ? '小红书' : platform === 'bili' ? 'B站' : platform
}

function goReview(item) {
  router.push({
    path: '/review',
    query: { title: item.title, platform: item.platform, savedId: item.id },
  })
}

async function remove(id) {
  if (!confirm('确认删除该选题？')) return
  try {
    const res = await fetch(`/api/saved-topics/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('删除失败')
    await fetchList()
  } catch (err) {
    loadError.value = err.message
  }
}

onMounted(() => fetchList())
</script>
