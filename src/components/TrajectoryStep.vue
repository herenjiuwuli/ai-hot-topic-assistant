<template>
  <div class="traj-step" :class="`step-${step.type}`">
    <!-- 工具调用步骤 -->
    <template v-if="step.type === 'tool'">
      <div class="step-head">
        <span class="step-dot" :title="step.name">🔧</span>
        <span class="step-title">调用工具 · {{ label }}</span>
        <span class="step-name">{{ step.name }}</span>
      </div>

      <div v-if="hasArgs" class="step-block">
        <div class="block-label">入参</div>
        <pre class="block-body mono">{{ argsText }}</pre>
      </div>

      <!-- 生成脚本：直接展示脚本文本 -->
      <div v-if="isScript" class="step-block script-block">
        <div class="block-label">脚本内容</div>
        <p class="block-body script-text">{{ scriptText }}</p>
      </div>

      <!-- 保存选题：成功摘要 -->
      <div v-else-if="isSaved" class="step-block saved-block">
        <div class="block-label">保存结果</div>
        <p class="block-body saved-text">✓ 已保存到选题库（id: {{ step.result.id }}）</p>
      </div>

      <!-- 排期：排期表 -->
      <div v-else-if="isSchedule" class="step-block">
        <div class="block-label">排期建议</div>
        <div class="schedule-list">
          <div v-for="(s, i) in scheduleItems" :key="i" class="schedule-row">
            <span class="s-date">{{ s.date }}</span>
            <span class="s-slot">{{ s.slot }}</span>
            <span class="s-note">{{ s.note }}</span>
          </div>
        </div>
        <p class="block-body tip">{{ tip }}</p>
      </div>

      <!-- 检索参考：命中列表 -->
      <div v-else-if="isSearch" class="step-block">
        <div class="block-label">检索结果（{{ hint }}）</div>
        <ul v-if="matches.length" class="ref-list">
          <li v-for="(m, i) in matches" :key="i" class="ref-item">{{ m.title }}</li>
        </ul>
        <ul v-else class="ref-list">
          <li v-for="(g, i) in generics" :key="i" class="ref-item">▸ {{ g }}</li>
        </ul>
      </div>

      <!-- 其他工具 / 出错：折叠 JSON -->
      <details class="step-block result-block" :open="openByDefault && !hasRich">
        <summary class="block-label">工具结果（{{ resultText }}）</summary>
        <pre class="block-body mono">{{ resultJson }}</pre>
      </details>
    </template>

    <!-- 终答步骤 -->
    <template v-else>
      <div class="step-head">
        <span class="step-dot">💡</span>
        <span class="step-title">Agent 终答</span>
      </div>
      <div class="step-block answer-block">
        <p class="answer-text">{{ step.content }}</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'

// 工具中文名（与后端 server/lib/tools.js 的 TOOL_LABELS 保持一致，但不能直接 import 服务端代码进浏览器）
const TOOL_LABELS = {
  fetch_hot_topics: '抓取实时热榜',
  generate_script: '生成脚本/文案',
  save_to_library: '保存到选题库',
  search_reference: '检索参考资料',
  plan_schedule: '规划排期',
}

const props = defineProps({
  step: { type: Object, required: true },
  index: { type: Number, default: 0 },
})

const label = computed(() => TOOL_LABELS[props.step.name] || props.step.name || '工具')
const hasArgs = computed(() => props.step.args && Object.keys(props.step.args).length > 0)
const argsText = computed(() => JSON.stringify(props.step.args, null, 2))

const resultJson = computed(() => JSON.stringify(props.step.result, null, 2))
const resultText = computed(() => {
  const r = props.step.result
  if (r && typeof r === 'object' && 'error' in r) return '失败'
  if (Array.isArray(r)) return `${r.length} 条`
  if (r && typeof r === 'object' && r.result) return '已生成'
  return '查看'
})

// —— 各工具富化展示 ——
const isScript = computed(() => props.step.name === 'generate_script' && !!props.step.result?.result)
const scriptText = computed(() => props.step.result?.result || '')

const isSaved = computed(
  () => props.step.name === 'save_to_library' && props.step.result?.status === 'saved',
)

const isSchedule = computed(() => props.step.name === 'plan_schedule' && Array.isArray(props.step.result?.suggestions))
const scheduleItems = computed(() => props.step.result?.suggestions || [])
const tip = computed(() => props.step.result?.tip || '')

const isSearch = computed(() => props.step.name === 'search_reference')
const matches = computed(() => props.step.result?.matches || [])
const generics = computed(() => props.step.result?.generic || [])
const hint = computed(() => props.step.result?.hint || '')

// 有富化展示时，JSON 折叠默认收起，避免内容重复
const hasRich = computed(() => isScript.value || isSaved.value || isSchedule.value || isSearch.value)
const openByDefault = computed(() => props.index === 0)
</script>

<style scoped>
.traj-step {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: var(--surface);
}
.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}
.step-tool .step-dot { background: var(--warning-soft); }
.step-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.step-name {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  background: var(--surface-3);
  padding: 2px 8px;
  border-radius: 999px;
}
.step-block {
  margin-top: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 10px 12px;
}
.block-label {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 6px;
  cursor: pointer;
  user-select: none;
}
details.step-block summary { cursor: pointer; }
details.step-block summary:hover { color: var(--primary); }
.block-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
}
.mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }

/* 脚本 */
.script-block { background: var(--primary-soft); border-color: var(--primary-soft-2); }
.script-text { color: var(--text); }

/* 保存 */
.saved-block { background: var(--success-soft); border-color: rgba(103, 194, 58, 0.3); }
.saved-text { color: var(--success); font-weight: 500; }

/* 排期 */
.schedule-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.schedule-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  padding: 4px 8px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
}
.s-date { color: var(--primary); font-weight: 600; min-width: 90px; }
.s-slot { color: var(--text); min-width: 80px; }
.s-note { color: var(--text-3); }
.tip { margin-top: 4px; color: var(--text-3); }

/* 检索 */
.ref-list { margin: 0; padding-left: 0; list-style: none; }
.ref-item {
  font-size: 12px;
  color: var(--text);
  padding: 4px 0;
  border-bottom: 1px dashed var(--border-soft);
}
.ref-item:last-child { border-bottom: none; }

/* 终答 */
.answer-block { background: var(--primary-soft); border-color: var(--primary-soft-2); }
.answer-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
