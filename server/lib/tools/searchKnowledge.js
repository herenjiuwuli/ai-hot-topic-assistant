// 新工具：search_knowledge
// 输入 query + top_k → 读取 RAG 索引 → 向量检索 → 返回拼接的知识片段文本。
// 供 ReAct Agent 在「需要账号定位/历史打法/平台规则」时先查资料再生成选题，缓解幻觉。
//
// 索引来源（二选一）：
//  1. 本地索引文件 server/lib/rag/rag-index.json（由 npm run rag:ingest 生成；已被 gitignore，
//     不随代码部署到 Serverless）。
//  2. 无索引文件时（Serverless 部署场景）直接从 knowledge/*.md 运行时构建并内存缓存，
//     与文档实时同步，规避「提交过期索引」「换 embedding provider 后向量不兼容」两类静默失效。
//     知识文档由 vercel.json 的 includeFiles 保证打进函数包。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RagStore } from '../rag/store.js'
import { embed } from '../rag/embed.js'
import { readKnowledgeDir, buildIndex } from '../rag/ingest.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const DEFAULT_INDEX_PATH = path.resolve(__dirname, 'rag', 'rag-index.json')
const KNOWLEDGE_DIR = process.env.RAG_KNOWLEDGE_DIR
  ? path.resolve(process.env.RAG_KNOWLEDGE_DIR)
  : path.resolve(REPO_ROOT, 'knowledge')

function indexPath() {
  return process.env.RAG_INDEX_PATH
    ? path.resolve(process.env.RAG_INDEX_PATH)
    : DEFAULT_INDEX_PATH
}

let cachedStore = null
let cachedPath = null
let runtimeBuildPromise = null

// 快路径：读本地索引文件（本地 dev 用，避免每次重建）
function loadStoreFromFile() {
  const p = indexPath()
  if (!fs.existsSync(p)) return null
  if (cachedStore && cachedPath === p) return cachedStore
  const index = JSON.parse(fs.readFileSync(p, 'utf8'))
  cachedStore = new RagStore().load(index)
  cachedPath = p
  return cachedStore
}

// 慢路径：无索引文件时从 knowledge/*.md 运行时构建。
// 并发保护：同一时间只构建一次，其余调用等待同一个 Promise。
async function buildStoreFromKnowledge() {
  if (cachedStore && cachedPath === 'runtime') return cachedStore
  if (!runtimeBuildPromise) {
    runtimeBuildPromise = (async () => {
      const docs = readKnowledgeDir(KNOWLEDGE_DIR)
      if (!docs.length) return null
      const index = await buildIndex(docs) // 全部块一次批量 embedding
      if (!index.chunks.length) return null
      cachedStore = new RagStore().load(index)
      cachedPath = 'runtime'
      return cachedStore
    })().finally(() => {
      runtimeBuildPromise = null
    })
  }
  return runtimeBuildPromise
}

// 测试/重建后清缓存
export function resetRagCache() {
  cachedStore = null
  cachedPath = null
  runtimeBuildPromise = null
}

/**
 * 检索知识库，返回拼接文本（带来源与来源标题与相关度）。
 * @param {string} query
 * @param {number} topK 默认 3
 * @returns {Promise<string>}
 */
export async function searchKnowledge(query, topK = 3) {
  let store = loadStoreFromFile()
  if (!store) store = await buildStoreFromKnowledge()
  if (!store || store.size === 0) {
    return '知识库不可用：本地请先运行 `npm run rag:ingest` 生成索引；线上请确认已部署 knowledge/*.md 并配置 EMBEDDING_PROVIDER / EMBEDDING_API_KEY。'
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
