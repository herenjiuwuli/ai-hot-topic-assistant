// 新工具：search_knowledge
// 输入 query + top_k → 读本地 RAG 索引 → 向量检索 → 返回拼接的知识片段文本。
// 供 ReAct Agent 在「需要账号定位/历史打法/平台规则」时先查资料再生成选题，缓解幻觉。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RagStore } from '../rag/store.js'
import { embed } from '../rag/embed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const DEFAULT_INDEX_PATH = path.resolve(__dirname, 'rag', 'rag-index.json')

function indexPath() {
  return process.env.RAG_INDEX_PATH
    ? path.resolve(process.env.RAG_INDEX_PATH)
    : DEFAULT_INDEX_PATH
}

let cachedStore = null
let cachedPath = null

function loadStore() {
  const p = indexPath()
  if (!fs.existsSync(p)) return null
  // 索引文件变更则重新加载
  if (cachedStore && cachedPath === p) return cachedStore
  const index = JSON.parse(fs.readFileSync(p, 'utf8'))
  cachedStore = new RagStore().load(index)
  cachedPath = p
  return cachedStore
}

// 测试/重建后清缓存
export function resetRagCache() {
  cachedStore = null
  cachedPath = null
}

/**
 * 检索知识库，返回拼接文本（带来源与来源标题与相关度）。
 * @param {string} query
 * @param {number} topK 默认 3
 * @returns {Promise<string>}
 */
export async function searchKnowledge(query, topK = 3) {
  const store = loadStore()
  if (!store || store.size === 0) {
    return '知识库为空，请先运行 `npm run rag:ingest` 构建索引（rag-index.json）。'
  }
  const q = String(query || '').trim()
  if (!q) return '未提供检索关键词。'

  const [qvec] = await embed([q])
  const hits = store.search(qvec, topK)
  if (!hits.length) return '未检索到相关知识片段。'

  return hits
    .map(
      (h, i) =>
        `【片段 ${i + 1}｜来源 ${h.source}${h.heading ? '｜' + h.heading : ''}｜相关度 ${h.score.toFixed(2)}】\n${h.text}`,
    )
    .join('\n\n---\n\n')
}
