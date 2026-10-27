// Agent 路由单测：真实 Express + 真 HTTP（随机端口），不打桩 runAgent。
// 覆盖：参数校验 400 / 未配置 key 的 503 / 演示模式完整链路 200 / SSE 事件流格式。
// 说明：走 DEEPSEEK_MOCK=1 时工具层返回演示数据，全程不联网、不耗 key。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withServer, useTempDataDir } from './_helpers.js'

let cleanupData
let savedEnv

beforeAll(async () => {
  savedEnv = { ...process.env }
  cleanupData = await useTempDataDir()
  delete process.env.DEEPSEEK_API_KEY
  process.env.DEEPSEEK_MOCK = '1'
})

afterAll(async () => {
  await cleanupData()
  for (const k of Object.keys(process.env)) {
    if (!(k in savedEnv)) delete process.env[k]
  }
  Object.assign(process.env, savedEnv)
})

describe('POST /api/agent — 参数校验', () => {
  it('缺 goal 返回 400，且提示要的是哪个参数', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/agent', {})
      expect(res.status).toBe(400)
      expect(res.json.error).toContain('goal')
    })
  })

  it('goal 不是字符串（传数字）也返回 400，不等到调模型才炸', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/agent', { goal: 123 })
      expect(res.status).toBe(400)
    })
  })
})

describe('POST /api/agent — 演示模式完整链路', () => {
  it('走完 5 轮工具调用给出终答，轨迹里能看见每个工具名', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/agent', { goal: '给我做 3 个 coser 选题', platform: 'rednote' })
      expect(res.status).toBe(200)
      expect(typeof res.json.answer).toBe('string')
      expect(res.json.answer.length).toBeGreaterThan(20)

      const toolNames = res.json.trajectory.filter((s) => s.type === 'tool').map((s) => s.name)
      // mockAgent 的固定编排：取热榜 → 查知识库 → 找参考 → 生成脚本 → 保存+排期（同一轮两个）
      expect(toolNames).toEqual([
        'fetch_hot_topics',
        'search_knowledge',
        'search_reference',
        'generate_script',
        'save_to_library',
        'plan_schedule',
      ])
      // 最后一步必须是 answer，否则前端会把"没说完"当成说完了
      expect(res.json.trajectory.at(-1).type).toBe('answer')
    })
  })

  it('轨迹每步都带 args 与 result，前端不用二次请求就能渲染', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/agent', { goal: '随便来个选题', platform: 'douyin' })
      const first = res.json.trajectory[0]
      expect(first.type).toBe('tool')
      expect(first.args).toBeTypeOf('object')
      expect(first.result).toBeDefined()
    })
  })

  it('artifacts 把工具结果提炼成前端可用结构（热榜/脚本/排期都在）', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/agent', { goal: '选题', platform: 'bili' })
      const arts = res.json.artifacts
      expect(Array.isArray(arts.hotTopics)).toBe(true)
      expect(arts.hotTopics.length).toBeGreaterThan(0)
      expect(arts.scripts.length).toBeGreaterThan(0)
      expect(Array.isArray(arts.schedule)).toBe(true)
    })
  })
})

describe('POST /api/agent — 未配置 key', () => {
  it('真实模式且没有 API key 时返回 503，而不是 500', async () => {
    process.env.DEEPSEEK_MOCK = '0'
    delete process.env.DEEPSEEK_API_KEY
    try {
      await withServer(async ({ request }) => {
        const res = await request('POST', '/api/agent', { goal: '选题' })
        // 503 =「服务端没配好」，500 =「代码出错」，两者对前端/运维的含义完全不同
        expect(res.status).toBe(503)
        expect(res.json.error).toContain('DEEPSEEK_API_KEY')
      })
    } finally {
      process.env.DEEPSEEK_MOCK = '1'
    }
  })
})

describe('POST /api/agent/stream — SSE', () => {
  it('响应头是事件流，事件依次为 step…done', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/agent/stream', { goal: '选题', platform: 'douyin' })
      expect(res.contentType).toContain('text/event-stream')

      const events = [...res.text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1])
      expect(events.length).toBeGreaterThan(0)
      expect(events.filter((e) => e === 'step').length).toBeGreaterThan(3)
      // 终态必须恰好在最后，且只有一个
      expect(events.at(-1)).toBe('done')
      expect(events.filter((e) => e === 'done')).toHaveLength(1)

      // 每条消息都必须是 event + data 成对，否则 EventSource 会静默丢帧
      const pairs = [...res.text.matchAll(/^event: \w+\ndata: (.+)$/gm)].map((m) => m[1])
      expect(pairs).toHaveLength(events.length)
      expect(() => JSON.parse(pairs.at(-1))).not.toThrow()
    })
  })

  it('缺 goal 时以 error 事件收尾（流已经开了，不能再返 400 状态码）', async () => {
    await withServer(async ({ request }) => {
      const res = await request('POST', '/api/agent/stream', {})
      expect(res.contentType).toContain('text/event-stream')
      expect(res.text).toContain('event: error')
      expect(res.text).toContain('goal')
      expect(res.text).not.toContain('event: done')
    })
  })
})
