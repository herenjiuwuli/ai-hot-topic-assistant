// 文本切分：按段落切块，目标每块 ~300–500 字（中文按字符计）。
// 设计原则：
//  - 标题（# 开头的行）会被保留并作为该块「heading」上下文，帮助检索时知道片段属于哪个主题。
//  - 超长段落按「句末标点」切分，句子永不被硬切，块间不重复文本（每块起点干净、语义完整）。
//  - 纯函数、无副作用，方便单测。
// 注：早期版本在块首叠加上一块尾部 60 字做「重叠」召回，代价是块首显示突兀（"接上文"）+
//    索引与 LLM 上下文重复文本；现改为句边界干净切分，展示与上下文更干净，
//    召回由 heading + 完整句子保证，实际效果更优。

// 按「实际字符数」计长度（中文每个字算 1，避免 UTF-16 码元把中文算成 2）
function clen(s) {
  return [...s].length
}

// 把超长段落按句末标点切成 ≤ maxChars 的片段（保留标点）；无标点的超长句兜底硬切
function splitLongParagraph(p, maxChars) {
  if (clen(p) <= maxChars) return [p]
  const parts = p.split(/(?<=[。！？!?；;])/)
  const out = []
  let cur = ''
  for (const part of parts) {
    if (!part) continue
    if (!cur || clen(cur) + clen(part) <= maxChars) {
      cur += part
    } else {
      if (cur) out.push(cur)
      cur = part
    }
  }
  if (cur) out.push(cur)
  return out.flatMap((piece) => (clen(piece) > maxChars ? hardSplit(piece, maxChars) : [piece]))
}

// 无句末标点可切时的兜底：按字符数硬切
function hardSplit(s, maxChars) {
  const chars = [...s]
  const out = []
  for (let i = 0; i < chars.length; i += maxChars) {
    out.push(chars.slice(i, i + maxChars).join(''))
  }
  return out
}

/**
 * 把 markdown/纯文本切成检索块。
 * @param {string} text 原始文本
 * @param {{maxChars?:number, overlap?:number}} opts maxChars=450 块上限；overlap 保留签名兼容（新策略不再使用，见文件头注释）
 * @returns {{text:string, heading:string}[]}
 */
export function chunkText(text, { maxChars = 450 } = {}) {
  if (!text || !clen(text.trim())) return []

  // 按空行分段
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => clen(p) > 0)

  const chunks = []
  let buf = ''
  // currentHeading：最近一次遇到的小节标题；bufHeading：**当前块**所属的小节标题。
  // 两者必须分开记：标题行会被并入上一块的缓冲区（为了段落还原不丢字符），
  // 若落盘时直接用 currentHeading，块的 heading 就会变成「下一节」的标题 —— 元数据张冠李戴。
  // 实测影响：heading 会随片段一起返回给模型（searchKnowledge 的「来源｜heading」），
  // 标错的章节名会误导模型，也让排查召回问题时归因错位。
  let currentHeading = ''
  let bufHeading = ''

  for (const p of paragraphs) {
    const h = p.match(/^#{1,6}\s+(.*)$/)
    if (h) {
      currentHeading = h[1].trim()
      // 缓冲区是空的：这个标题就是本块的开头标题
      if (!clen(buf)) bufHeading = currentHeading
      // 标题本身通常很短，先并入缓冲区，跟随其后的正文一起成块
      buf = buf ? `${buf}\n\n${p}` : p
      continue
    }

    // 超长段落先按句切，再逐句并入缓冲区（段内连续拼接、段间空行分隔，保证可精确还原）
    const pieces = splitLongParagraph(p, maxChars)
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]
      const sep = i === 0 ? '\n\n' : ''
      const candidate = buf ? `${buf}${sep}${piece}` : piece
      if (clen(candidate) > maxChars && clen(buf) > 0) {
        // 当前块已满，落盘（用 bufHeading，不是 currentHeading）；新块从当前句子开始
        chunks.push({ text: buf, heading: bufHeading })
        buf = piece
        bufHeading = currentHeading
      } else {
        if (!clen(buf)) bufHeading = currentHeading
        buf = candidate
      }
    }
  }
  if (clen(buf) > 0) chunks.push({ text: buf, heading: bufHeading })
  return chunks
}

// 兼容别名（部分调用方习惯 chunkMarkdown）
export const chunkMarkdown = chunkText
