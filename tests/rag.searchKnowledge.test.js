// search_knowledge 工具单测（vitest）—— 离线，用 fake embedding
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { buildIndex } from '../server/lib/rag/ingest.js'
import { searchKnowledge, resetRagCache } from '../server/lib/tools/searchKnowledge.js'

const TMP_INDEX = path.join(os.tmpdir(), `rag-test-index-${Date.now()}.json`)

const docs = [
  {
    source: '平台规则与雷区.md',
    text:
      '# 平台规则与雷区\n\n## 版权与 IP\ncos 商用未授权大 IP 需品牌方已获授权；BGM 直接用番剧原声易被下架，优先用平台音乐库或无版权音乐。\n\n## 未成年人规则\n不得诱导未成年人打赏或私下联系，互动话术避免引导性表达。',
  },
  {
    source: '二次元赛道打法.md',
    text:
      '# 二次元赛道打法\n\n## 平台适配\n抖音做漏斗引流，B站做深度沉淀，小红书做搜索流量，微博做互动。一条还原素材可剪 4 种版本。\n\n## 内容支柱\n还原、教程、日常、联动四支柱轮流更新。',
  },
  {
    source: '往期爆款复盘.md',
    text:
      '# 往期爆款复盘\n\n## 抢热点还原\n新番角色上线周做高还原正片加原设对比图，踩中热度窗口。\n\n## 新手教程\n平价假发打理教程收藏率高，长尾搜索流量好。',
  },
]

beforeAll(async () => {
  process.env.EMBEDDING_PROVIDER = 'fake'
  const index = await buildIndex(docs)
  fs.writeFileSync(TMP_INDEX, JSON.stringify(index))
})

afterAll(() => {
  if (fs.existsSync(TMP_INDEX)) fs.unlinkSync(TMP_INDEX)
  delete process.env.RAG_INDEX_PATH
})

describe('searchKnowledge 工具', () => {
  it('知识库为空时返回提示', async () => {
    resetRagCache()
    process.env.RAG_INDEX_PATH = path.join(os.tmpdir(), 'rag-nonexistent-xyz.json')
    const r = await searchKnowledge('版权')
    expect(typeof r).toBe('string')
    expect(r).toContain('知识库为空')
  })

  it('空查询返回提示', async () => {
    resetRagCache()
    process.env.RAG_INDEX_PATH = TMP_INDEX
    const r = await searchKnowledge('   ')
    expect(r).toContain('未提供检索关键词')
  })

  it('检索返回带来源的相关片段', async () => {
    resetRagCache()
    process.env.RAG_INDEX_PATH = TMP_INDEX
    const r = await searchKnowledge('版权 雷区 BGM 下架 侵权')
    expect(typeof r).toBe('string')
    expect(r).toContain('来源')
    expect(r).toContain('平台规则与雷区.md')
    // 版权相关片段应排在最前（相关度最高）
    expect(r.indexOf('平台规则与雷区.md')).toBeLessThan(r.indexOf('二次元赛道打法.md'))
  })

  it('top_k 控制返回片段数', async () => {
    resetRagCache()
    process.env.RAG_INDEX_PATH = TMP_INDEX
    const r = await searchKnowledge('平台 适配 抖音 B站', 1)
    const parts = r.split('\n\n---\n\n')
    expect(parts).toHaveLength(1)
  })
})
