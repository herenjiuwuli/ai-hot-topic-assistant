// 向量检索单测（vitest）—— 构造已知向量验证余弦排序
import { describe, it, expect } from 'vitest'
import { RagStore, cosineSim } from '../server/lib/rag/store.js'

const chunks = [
  { id: 'a', text: '版权与 IP 风险', heading: '版权', source: '平台规则与雷区.md' },
  { id: 'b', text: '各平台审核红线', heading: '红线', source: '平台规则与雷区.md' },
  { id: 'c', text: '往期爆款复盘', heading: '复盘', source: '往期爆款复盘.md' },
]
// 正交基向量，便于断言排序
const embeddings = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
]

describe('cosineSim', () => {
  it('相同向量相似度 1，正交为 0', () => {
    expect(cosineSim([1, 0], [1, 0])).toBeCloseTo(1, 6)
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })
  it('长度不一致返回 0', () => {
    expect(cosineSim([1], [1, 0])).toBe(0)
  })
})

describe('RagStore.search', () => {
  it('空索引返回空数组', () => {
    const s = new RagStore()
    expect(s.search([1, 0, 0, 0])).toEqual([])
    expect(s.size).toBe(0)
  })

  it('top-k 返回最相关块（按余弦降序）', () => {
    const s = new RagStore().set(chunks, embeddings)
    expect(s.size).toBe(3)
    const top = s.search([1, 0, 0, 0], 3)
    expect(top[0].id).toBe('a')
    expect(top[0].score).toBeCloseTo(1, 6)
    expect(top.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('top_k 限制返回数量', () => {
    const s = new RagStore().set(chunks, embeddings)
    const top = s.search([0, 1, 0, 0], 1)
    expect(top).toHaveLength(1)
    expect(top[0].id).toBe('b')
  })

  it('返回块带来源与相关度字段', () => {
    const s = new RagStore().set(chunks, embeddings)
    const top = s.search([0, 0, 1, 0], 2)
    expect(top[0]).toHaveProperty('source', '往期爆款复盘.md')
    expect(top[0]).toHaveProperty('score')
  })
})
