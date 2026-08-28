// 可插拔文本向量化（embedding）。
// 通过环境变量 EMBEDDING_PROVIDER 选择实现：local / zhipu / volcene / openai / fake。
// 统一签名：embed(texts: string[]): Promise<number[][]>
//
//  - fake：确定性哈希向量，不联网，仅供单测与本地离线演示（检索质量弱，但能跑通全链路）。
//  - local：@xenova/transformers 加载 bge-small-zh-v1.5，免费/离线/中文效果好（需联网首次下载模型权重）。
//  - zhipu / volcengine / openai：OpenAI 兼容接口，需 EMBEDDING_API_KEY，适合部署（避免 Serverless 冷启动拉模型）。
//
// 默认走 local；但请只在能下载模型或已配 key 的环境用 local/hosted。单测统一用 fake。

const FAKE_DIM = 32

function fakeEmbedder(texts) {
  return Promise.resolve(
    texts.map((t) => {
      const v = new Array(FAKE_DIM).fill(0)
      const s = String(t)
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i)
        v[code % FAKE_DIM] += 1
        v[(code * 7) % FAKE_DIM] += 0.5
      }
      const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1
      return v.map((x) => x / norm)
    }),
  )
}

// 本地 bge 模型（懒加载，避免测试/未用时拉包）
async function localEmbedder(texts) {
  const { pipeline, env } = await import('@xenova/transformers')
  // 国内网络说明：huggingface.co 直连被墙，且其 onnx 模型属 LFS 大文件，
  // 国内镜像（hf-mirror 等）通常只镜像小文件、大文件会重定向回墙外。
  // 因此本地跑 bge 二选一：
  //  1) 开代理（如 Clash）后直接 npm run rag:ingest（走默认 huggingface.co）
  //  2) 设 HF_ENDPOINT=https://hf-mirror.com 试镜像（大文件仍可能失败，需代理）
  // 部署到 Serverless 时请用 zhipu/volcengine 等 hosted 方案（见 EMBEDDING_PROVIDER）
  if (process.env.HF_ENDPOINT) env.HF_ENDPOINT = process.env.HF_ENDPOINT
  const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5')
  const out = await extractor(texts, { pooling: 'mean', normalize: true })
  // out 是 Tensor：data 为一维 Float32Array，dims=[batch, dim]
  const dim = out.dims[out.dims.length - 1]
  const batch = out.dims[out.dims.length - 2]
  const arr = Array.from(out.data)
  const result = []
  for (let b = 0; b < batch; b++) {
    result.push(arr.slice(b * dim, b * dim + dim))
  }
  return result
}

// OpenAI 兼容接口（智谱/火山/OpenAI 共用）
function openAIEmbedder(url, model) {
  return async (texts) => {
    const apiKey = process.env.EMBEDDING_API_KEY
    if (!apiKey) throw new Error('EMBEDDING_API_KEY 未配置')
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: texts }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Embedding API error (${res.status}): ${err}`)
    }
    const data = await res.json()
    // 兼容 input 为数组时返回顺序与输入一致
    return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
  }
}

function resolveProvider() {
  const p = (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase()
  switch (p) {
    case 'fake':
      return fakeEmbedder
    case 'local':
      return localEmbedder
    case 'zhipu':
      return openAIEmbedder('https://open.bigmodel.cn/api/paas/v4/embeddings', 'embedding-2')
    case 'volcengine':
      return openAIEmbedder('https://ark.cn-beijing.volces.com/api/v3/embeddings', 'doubao-embedding')
    case 'openai':
      return openAIEmbedder('https://api.openai.com/v1/embeddings', 'text-embedding-3-small')
    default:
      throw new Error(`未知 EMBEDDING_PROVIDER: ${p}`)
  }
}

export async function embed(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return []
  const fn = resolveProvider()
  return fn(texts)
}

// 供单测直接引用的确定性实现
export const fakeEmbedderForTest = fakeEmbedder
