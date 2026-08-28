// 文本切分单测（vitest）
import { describe, it, expect } from 'vitest'
import { chunkText } from '../server/lib/rag/chunk.js'

// 按「字符数」计长度（与 chunk.js 内部一致）
function clen(s) {
  return [...s].length
}

const base = `二次元赛道的受众集中在 15 到 30 岁，女性占比偏高，核心是「为爱发电」的高粘性用户。他们不是在消费信息，而是在消费认同与陪伴。运营一个 coser 账号定位要先想清楚三件事：你 cos 的是哪类 IP、人设是技术流还是邻家感、目标在哪个平台长尾变现。不要试图讨好所有人，二次元用户极其看重懂行。`

const doc = `# 二次元赛道打法

## 一、赛道定位与核心人群

${base}

${base}

${base}

## 二、四大内容支柱

稳定的账号靠栏目不靠灵感，建议把内容拆成四个支柱轮流更新避免断更。还原是吸粉基本盘，教程转发率最高易被收藏，日常强化真人感提升粘性，联动是破圈主要方式。比例建议还原 40%、教程 25%、日常 20%、联动 15%。

${base}

${base}`

describe('chunkText', () => {
  it('空文本返回空数组', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
  })

  it('短文本（不足上限）切成单块', () => {
    const chunks = chunkText('一句话。两句话。', { maxChars: 450 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain('一句话')
  })

  it('长文本切成多块，且每块不超过 上限+重叠', () => {
    const chunks = chunkText(doc, { maxChars: 450, overlap: 60 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(clen(c.text)).toBeLessThanOrEqual(450 + 60 + 5) // 容差
    }
  })

  it('不丢失任何原始段落（所有段落都出现在某块中）', () => {
    const paras = doc
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
    const all = paras.join('\n')
    const chunks = chunkText(doc, { maxChars: 450, overlap: 60 })
    const merged = chunks.map((c) => c.text).join('\n')
    // 每个原始段落的关键片段应能在合并结果里找到（重叠保证不被截断丢失）
    for (const p of paras) {
      const key = p.replace(/^#+\s*/, '').slice(0, 12)
      if (key) expect(merged).toContain(key)
    }
    void all
  })

  it('保留标题作为块的 heading 上下文', () => {
    const chunks = chunkText(doc, { maxChars: 450, overlap: 60 })
    const headings = chunks.map((c) => c.heading)
    expect(headings.some((h) => h.includes('赛道定位'))).toBe(true)
    expect(headings.some((h) => h.includes('内容支柱'))).toBe(true)
  })
})
