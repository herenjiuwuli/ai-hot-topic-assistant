// embedding 单测（vitest）—— 用 fake 提供方，不联网
import { describe, it, expect, beforeAll } from 'vitest'
import { embed, fakeEmbedderForTest } from '../server/lib/rag/embed.js'

beforeAll(() => {
  process.env.EMBEDDING_PROVIDER = 'fake'
})

describe('embedding (fake)', () => {
  it('返回定长向量，维度一致', async () => {
    const vecs = await embed(['版权风险', '平台雷区', '爆款复盘'])
    expect(vecs).toHaveLength(3)
    for (const v of vecs) {
      expect(Array.isArray(v)).toBe(true)
      expect(v).toHaveLength(32)
      // 已归一化：模长≈1
      const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0))
      expect(norm).toBeCloseTo(1, 1)
    }
  })

  it('相同输入产生相同向量（确定性）', async () => {
    const a = await fakeEmbedderForTest(['二次元 coser'])
    const b = await fakeEmbedderForTest(['二次元 coser'])
    expect(a[0]).toEqual(b[0])
  })

  it('空数组返回空', async () => {
    expect(await embed([])).toEqual([])
  })

  it('字符重叠越高的文本，余弦相似度越高', async () => {
    const [v1, v2, v3] = await embed([
      '版权 雷区 BGM 下架 侵权',
      '版权 雷区 BGM 下架 侵权',
      '今天天气真好 出去散步',
    ])
    // 直接拷贝最接近自身
    const sim = (a, b) => {
      let dot = 0
      let na = 0
      let nb = 0
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb))
    }
    expect(sim(v1, v2)).toBeGreaterThan(sim(v1, v3))
  })
})
