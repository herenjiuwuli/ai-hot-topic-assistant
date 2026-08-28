// 建库：读 knowledge/*.md → 切块 → 向量化 → 写索引 JSON。
// 也可编程调用 buildIndex(docs) 喂任意文档（如后续接历史选题库）。
import 'dotenv/config' // 让 npm run rag:ingest 直接读取项目根 .env（EMBEDDING_PROVIDER / EMBEDDING_API_KEY）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chunkText } from './chunk.js'
import { embed } from './embed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 仓库根 = 上溯两级（server/lib/rag → 仓库根）
const REPO_ROOT = path.resolve(__dirname, '../../..')
const KNOWLEDGE_DIR = path.resolve(REPO_ROOT, 'knowledge')
const INDEX_PATH = path.resolve(__dirname, 'rag-index.json')

/**
 * 把若干文档切成带元信息的块（不向量化）。
 * @param {{source:string, text:string}[]} docs
 */
export function buildChunks(docs) {
  const chunks = []
  for (const doc of docs) {
    const cs = chunkText(doc.text)
    for (const c of cs) {
      chunks.push({
        id: `${doc.source}#${chunks.length}`,
        text: c.text,
        heading: c.heading || '',
        source: doc.source,
      })
    }
  }
  return chunks
}

/**
 * 从知识库目录读全部 .md 文档。
 */
export function readKnowledgeDir(dir = KNOWLEDGE_DIR) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ source: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }))
}

/**
 * 建索引：切块 + 向量化。
 * @param {{source:string,text:string}[]} docs
 */
export async function buildIndex(docs) {
  const chunks = buildChunks(docs)
  const embeddings = chunks.length ? await embed(chunks.map((c) => c.text)) : []
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    provider: (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase(),
    chunks,
    embeddings,
  }
}

/**
 * 读 knowledge/ 目录建索引并落盘。
 * @param {{knowledgeDir?:string, indexPath?:string}} opts
 */
export async function ingest({ knowledgeDir = KNOWLEDGE_DIR, indexPath = INDEX_PATH } = {}) {
  const docs = readKnowledgeDir(knowledgeDir)
  const index = await buildIndex(docs)
  fs.mkdirSync(path.dirname(indexPath), { recursive: true })
  fs.writeFileSync(indexPath, JSON.stringify(index))
  return index
}

// node server/lib/rag/ingest.js 直接运行时执行
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ingest()
    .then((idx) => {
      console.log(`✅ RAG 索引构建完成：${idx.chunks.length} 个块，来源 ${new Set(idx.chunks.map((c) => c.source)).size} 篇文档`)
    })
    .catch((e) => {
      console.error('❌ RAG 建库失败：', e.message)
      process.exit(1)
    })
}
