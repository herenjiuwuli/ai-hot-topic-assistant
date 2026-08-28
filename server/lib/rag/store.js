// 向量索引的内存检索：余弦相似度 top-k。
// 索引结构：{ chunks: [{id, text, heading, source}], embeddings: number[][] }
// 不引重型向量库——数据量小（运营知识文档几十篇），内存余弦足够，部署也快。

export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

export class RagStore {
  constructor() {
    this.chunks = []
    this.embeddings = []
  }

  load(index) {
    this.chunks = (index && index.chunks) || []
    this.embeddings = (index && index.embeddings) || []
    return this
  }

  set(chunks, embeddings) {
    this.chunks = chunks
    this.embeddings = embeddings
    return this
  }

  toIndex() {
    return { chunks: this.chunks, embeddings: this.embeddings }
  }

  get size() {
    return this.chunks.length
  }

  /**
   * 检索 top-k 最相关块。
   * @param {number[]} queryVec 查询向量
   * @param {number} topK 默认 3
   * @returns {{id:string,text:string,heading:string,source:string,score:number}[]}
   */
  search(queryVec, topK = 3) {
    if (this.size === 0) return []
    const scored = this.chunks.map((c, i) => ({
      id: c.id,
      text: c.text,
      heading: c.heading || '',
      source: c.source || '',
      score: cosineSim(queryVec, this.embeddings[i] || []),
    }))
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }
}
