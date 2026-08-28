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

// 原文按空行分段（与 chunk.js 对齐）
function paragraphsOf(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

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

  it('长文本切成多块，每块不超过上限', () => {
    const chunks = chunkText(doc, { maxChars: 450 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(clen(c.text)).toBeLessThanOrEqual(450 + 5) // 容差
    }
  })

  it('多段落文档：块间精确还原原文（不丢失、不重复、不插入）', () => {
    const chunks = chunkText(doc, { maxChars: 450 })
    const merged = chunks.map((c) => c.text).join('\n\n')
    expect(merged).toBe(paragraphsOf(doc).join('\n\n'))
  })

  it('超长单段落按句末标点切分，句子不被切断、不重复', () => {
    // 每句约 230 字 × 4 = 约 920 字，必被切成多块
    const longPara = [1, 2, 3, 4].map((n) => `第${n}句：${base}`).join('')
    const chunks = chunkText(longPara, { maxChars: 450 })
    expect(chunks.length).toBeGreaterThan(1)
    // 无分隔符拼接后与原文完全一致 → 证明不丢字、不重复、不插入
    expect(chunks.map((c) => c.text).join('')).toBe(longPara)
    // 非首块的起点必须紧跟句末标点（句子没被硬切，不再出现"接上文"的半个句子）
    for (let i = 1; i < chunks.length; i++) {
      const startIdx = longPara.indexOf(chunks[i].text)
      expect(startIdx).toBeGreaterThan(0)
      expect('。！？!?；;'.includes(longPara[startIdx - 1])).toBe(true)
    }
  })

  it('保留标题作为块的 heading 上下文', () => {
    const chunks = chunkText(doc, { maxChars: 450 })
    const headings = chunks.map((c) => c.heading)
    expect(headings.some((h) => h.includes('赛道定位'))).toBe(true)
    expect(headings.some((h) => h.includes('内容支柱'))).toBe(true)
  })
})
