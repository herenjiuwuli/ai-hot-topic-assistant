// /api/topics 路由单测：重点测「AI 返回不听话时的兜底」。
// 这个接口的真实事故都是这一类：模型把 JSON 包在 ```json 里、直接返数组、
// 或者干脆返回一段废话 —— 解析失败如果不兜底，用户看到的就是 500 或空列表。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { withServer } from './_helpers.js'

const mockSnapshots = vi.fn()
const mockFetchNorm = vi.fn()
const mockChat = vi.fn()

// 只替换会联网/落盘的两个函数，isValidPlatform 用真实现（它本身就是被测对象）
vi.mock('../server/lib/hotlistSource.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getSnapshots: (...a) => mockSnapshots(...a),
    fetchAndNormalize: (...a) => mockFetchNorm(...a),
  }
})

vi.mock('../server/lib/ai.js', () => ({
  chatWithDeepSeek: (...a) => mockChat(...a),
}))

const TODAY = new Date().toISOString().slice(0, 10)

const goodTopics = {
  topics: [
    { title: '选题1', angle: '角度1', why: '理由1', tags: ['a'] },
    { title: '选题2', angle: '角度2', why: '理由2', tags: ['b'] },
  ],
}

beforeEach(() => {
  // 500 分支的用例会让路由 console.error 打栈，这里静音，避免刷屏
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockSnapshots.mockReset()
  mockFetchNorm.mockReset()
  mockChat.mockReset()
  // 默认：今天有抖音快照
  mockSnapshots.mockResolvedValue([
    { date: TODAY, platform: 'douyin', items: Array.from({ length: 20 }, (_, i) => ({ title: `热榜${i}`, hot: 1000 - i, rank: i + 1 })) },
  ])
  mockChat.mockResolvedValue(JSON.stringify(goodTopics))
})

describe('POST /api/topics — 参数校验', () => {
  it('缺 positioning 返回 400', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { platform: 'douyin' })
      expect(res.status).toBe(400)
    })
  })

  it('非法平台返回 400（不能拿任意的字符串去拼第三方 URL）', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'kuaishou' })
      expect(res.status).toBe(400)
      expect(res.json.error).toContain('平台')
    })
  })
})

describe('POST /api/topics — 热榜来源', () => {
  it('有当日快照时直接用快照，不再打第三方接口', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(200)
      expect(mockFetchNorm).not.toHaveBeenCalled()
      // prompt 里只放 Top 15，且带序号
      const prompt = mockChat.mock.calls[0][0].at(-1).content
      expect(prompt).toContain('1. 热榜0')
      expect(prompt).toContain('15. 热榜14')
      expect(prompt).not.toContain('16. ')
    })
  })

  it('没有快照时回落到实时抓取', async () => {
    mockSnapshots.mockResolvedValue([])
    mockFetchNorm.mockResolvedValue([{ title: '实时热榜', hot: 9, rank: 1 }])
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'bili' })
      expect(res.status).toBe(200)
      expect(mockFetchNorm).toHaveBeenCalledWith('bili')
    })
  })

  it('快照和实时抓取都拿不到数据时返回 503（不是 500，也不是空列表）', async () => {
    mockSnapshots.mockResolvedValue([])
    mockFetchNorm.mockRejectedValue(new Error('third-party down'))
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(503)
      expect(res.json.error).toContain('热榜')
    })
  })
})

describe('POST /api/topics — AI 返回格式的容错', () => {
  it('标准 { topics: [...] } 正常解析', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(200)
      expect(res.json.topics).toHaveLength(2)
      expect(res.json.topics[0]).toMatchObject({ title: '选题1', angle: '角度1' })
    })
  })

  it('带 ```json 围栏也能解析（模型最常见的不听话方式）', async () => {
    mockChat.mockResolvedValue('```json\n' + JSON.stringify(goodTopics) + '\n```')
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(200)
      expect(res.json.topics).toHaveLength(2)
    })
  })

  it('直接返数组（没有 topics 外层）也能解析', async () => {
    mockChat.mockResolvedValue(JSON.stringify(goodTopics.topics))
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(200)
      expect(res.json.topics).toHaveLength(2)
    })
  })

  it('夹在一段废话里的数组能被抠出来', async () => {
    mockChat.mockResolvedValue('好的，以下是选题：' + JSON.stringify(goodTopics.topics) + '\n希望有帮助')
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(200)
      expect(res.json.topics).toHaveLength(2)
    })
  })

  it('完全解析不出东西时返回 502（说明是模型/上游的问题，不是用户的错）', async () => {
    mockChat.mockResolvedValue('抱歉，我无法完成这个请求。')
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(502)
      expect(res.json.error).toContain('AI')
    })
  })

  it('返回空数组也当解析失败处理', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ topics: [] }))
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(502)
    })
  })
})

describe('POST /api/topics — 字段规范化', () => {
  it('超过 5 条只留前 5 条（前端版位就 5 个）', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ topics: Array.from({ length: 9 }, (_, i) => ({ title: `t${i}` })) }))
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.json.topics).toHaveLength(5)
    })
  })

  it('缺字段补空串、tags 不是数组就归零，不让前端拿到 undefined', async () => {
    mockChat.mockResolvedValue(JSON.stringify({ topics: [{ title: '只有标题', tags: '不是数组' }] }))
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.json.topics[0]).toEqual({ title: '只有标题', angle: '', why: '', tags: [] })
    })
  })

  it('传了 topic 时 prompt 里必须带上它（否则"围绕这个话题"就成了一句空话）', async () => {
    await withServer(async ({ request }) => {
      await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin', topic: '某漫展' })
      const prompt = mockChat.mock.calls[0][0].at(-1).content
      expect(prompt).toContain('某漫展')
      expect(prompt).toContain('用户选中的热榜话题')
    })
  })

  it('模型调用本身抛错时返回 500 并带出原因', async () => {
    mockChat.mockRejectedValue(new Error('DeepSeek API error (401): bad key'))
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/topics', { positioning: 'coser', platform: 'douyin' })
      expect(res.status).toBe(500)
      expect(res.json.error).toContain('401')
    })
  })
})
