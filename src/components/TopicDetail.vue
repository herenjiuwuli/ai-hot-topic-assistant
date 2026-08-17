<template>
  <div class="drawer-mask" @click.self="$emit('close')">
    <aside class="drawer" role="dialog" aria-label="选题详情">
      <div class="drawer-head">
        <span class="drawer-title">选题细节</span>
        <button class="drawer-close" title="关闭" @click="$emit('close')">✕</button>
      </div>

      <div class="drawer-body" @click.stop>
        <div class="drawer-big-title">{{ topic.title }}</div>
        <div v-if="topic.sourceTopic" class="drawer-source">
          来源话题：<b>{{ topic.sourceTopic }}</b>
        </div>

        <div class="drawer-section">
          <span class="card-label">创作角度</span>
          <p class="field-value">{{ topic.angle }}</p>
        </div>

        <div class="drawer-section">
          <span class="card-label">为什么适合</span>
          <p class="field-value">{{ topic.why }}</p>
        </div>

        <div v-if="topic.tags && topic.tags.length" class="drawer-section">
          <span class="card-label">话题标签</span>
          <div class="tags">
            <span v-for="tag in topic.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>

        <!-- 写内容 -->
        <div class="drawer-section">
          <span class="card-label">一键延展内容</span>
          <div v-if="!showMenu" class="topic-actions" style="border: none; padding: 0; margin-top: 8px">
            <button class="btn ghost-warning small" @click="showMenu = true">✍️ 写内容</button>
          </div>
          <div v-else class="content-menu">
            <button class="btn small" :disabled="contentLoading" @click="generateContent('script')">🎬 短视频脚本</button>
            <button class="btn small" :disabled="contentLoading" @click="generateContent('copy')">📝 图文文案</button>
            <button class="btn muted small" @click="showMenu = false">取消</button>
          </div>

          <div v-if="contentResult" class="content-result">
            <div class="cr-header">
              <span class="cr-label">{{ contentResultType === 'script' ? '🎬 短视频脚本' : '📝 图文文案' }}</span>
              <button class="btn ghost small" @click="copyResult">{{ copyResultBtnText }}</button>
            </div>
            <pre class="cr-body">{{ contentResult }}</pre>
          </div>
          <div v-if="contentLoading" class="cr-loading">⏳ 生成中…</div>
          <div v-if="contentError" class="cr-error">{{ contentError }}</div>
        </div>
      </div>

      <div class="drawer-foot" @click.stop>
        <button class="btn ghost" @click="copyTopic">{{ copyBtnText }}</button>
        <button class="btn primary" @click="$emit('save', topic)">💾 保存到选题库</button>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  topic: { type: Object, required: true },
})
const emit = defineEmits(['close', 'save'])

const copyBtnText = ref('📋 复制')
const showMenu = ref(false)
const contentResult = ref('')
const contentResultType = ref('')
const contentLoading = ref(false)
const contentError = ref('')
const copyResultBtnText = ref('📋 复制')

async function copyTopic() {
  const text = `【选题】${props.topic.title}\n【创作角度】${props.topic.angle}\n【为什么适合】${props.topic.why}\n【话题标签】${props.topic.tags?.join(' ') || ''}`
  let success = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      success = true
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      success = document.execCommand('copy')
      document.body.removeChild(ta)
    }
  } catch { success = false }
  if (success) {
    copyBtnText.value = '✅ 已复制'
    setTimeout(() => { copyBtnText.value = '📋 复制' }, 1500)
  }
}

async function generateContent(type) {
  showMenu.value = false
  contentLoading.value = true
  contentError.value = ''
  contentResult.value = ''
  contentResultType.value = type
  try {
    const res = await fetch('/api/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: props.topic.title,
        angle: props.topic.angle,
        platform: props.topic.platform || 'douyin',
        type,
        tags: props.topic.tags,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    contentResult.value = data.result
  } catch (err) {
    contentError.value = err.message
  } finally {
    contentLoading.value = false
  }
}

async function copyResult() {
  let success = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(contentResult.value)
      success = true
    } else {
      const ta = document.createElement('textarea')
      ta.value = contentResult.value
      document.body.appendChild(ta)
      ta.select()
      success = document.execCommand('copy')
      document.body.removeChild(ta)
    }
  } catch { success = false }
  if (success) {
    copyResultBtnText.value = '✅ 已复制'
    setTimeout(() => { copyResultBtnText.value = '📋 复制' }, 1500)
  }
}
</script>
