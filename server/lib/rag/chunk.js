// 文本切分：按段落切块，目标每块 ~300–500 字（中文按字符计），块间重叠 ~60 字。
// 设计原则：
//  - 标题（# 开头的行）会被保留并作为该块「heading」上下文，帮助检索时知道片段属于哪个主题。
//  - 重叠保证句子/上下文不被硬切断，提升检索召回。
//  - 纯函数、无副作用，方便单测。

// 按「实际字符数」计长度（中文每个字算 1，避免 UTF-16 码元把中文算成 2）
function clen(s) {
  return [...s].length
}

/**
 * 把 markdown/纯文本切成检索块。
 * @param {string} text 原始文本
 * @param {{maxChars?:number, overlap?:number}} opts maxChars=450 块上限，overlap=60 重叠字符数
 * @returns {{text:string, heading:string}[]}
 */
export function chunkText(text, { maxChars = 450, overlap = 60 } = {}) {
  if (!text || !clen(text.trim())) return []

  // 按空行分段
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+$/g, '').replace(/^\s+/g, ''))
    .filter((p) => clen(p) > 0)

  const chunks = []
  let buf = ''
  let heading = ''

  for (const p of paragraphs) {
    const h = p.match(/^#{1,6}\s+(.*)$/)
    if (h) {
      heading = h[1].trim()
      // 标题本身通常很短，先并入缓冲区，跟随其后的正文一起成块
      buf = buf ? `${buf}\n\n${p}` : p
      continue
    }

    const candidate = buf ? `${buf}\n\n${p}` : p
    if (clen(candidate) > maxChars && clen(buf) > 0) {
      // 当前块已满，落盘；新块从上一块尾部重叠开始
      chunks.push({ text: buf, heading })
      const tail = buf.slice(Math.max(0, buf.length - overlap))
      buf = `${tail}\n\n${p}`
    } else {
      buf = candidate
    }
  }
  if (clen(buf) > 0) chunks.push({ text: buf, heading })
  return chunks
}

// 兼容别名（部分调用方习惯 chunkMarkdown）
export const chunkMarkdown = chunkText
