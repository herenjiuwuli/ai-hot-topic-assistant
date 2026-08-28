// Agent 循环 + 工具执行器单测（vitest）
// 关键技巧：runAgent 支持注入假 LLM（llmOverride），配合 DEEPSEEK_MOCK=1（工具返回假数据），
// 全程不联网、不耗 key 即可测完整循环。
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { runAgent } from '../server/lib/agent.js'
import { executeTool } from '../server/lib/tools.js'

// mock 掉 savedTopics，避免「自动保存兜底」测试写真实数据文件
vi.mock('../server/routes/savedTopics.js', () => ({
  saveTopic: vi.fn(async (rec) => ({ ...rec, id: 'auto_' + Date.now(), status: 'saved' })),
}))

// —— 假 LLM 工具函数 ——
let callSeq = 0
function toolCallMsg(name, args) {
  callSeq += 1
  return {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: `call_${callSeq}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  }
}
const answerMsg = (content) => ({ role: 'assistant', content })

// 按脚本序列依次返回消息，最后一条之后重复返回（测截断用）
function fakeLLM(sequence) {
  let i = 0
  return async () => sequence[Math.min(i++, sequence.length - 1)]
}

beforeAll(() => {
  process.env.DEEPSEEK_MOCK = '1' // 工具执行器走假数据，不联网
})
afterAll(() => {
  delete process.env.DEEPSEEK_MOCK
})

describe('Agent 循环', () => {
  it('多工具编排：调 2 个工具后给出终答', async () => {
    const seq = [
      toolCallMsg('fetch_hot_topics', { platform: 'douyin', limit: 10 }),
      toolCallMsg('generate_script', { title: '测试话题', type: 'script', platform: 'douyin' }),
      answerMsg('完成！'),
    ]
    const { answer, trajectory, artifacts } = await runAgent(
      { goal: '选话题写脚本', platform: 'douyin' },
      { llm: fakeLLM(seq) },
    )
    expect(answer).toBe('完成！')
    expect(trajectory).toHaveLength(3)
    expect(trajectory[0].type).toBe('tool')
    expect(trajectory[0].name).toBe('fetch_hot_topics')
    expect(trajectory[1].name).toBe('generate_script')
    expect(trajectory[2].type).toBe('answer')
    expect(trajectory[0].result).toHaveLength(5) // mock 热榜共 5 条
    // artifacts：结构化产物应提炼出热榜与脚本
    expect(artifacts.hotTopics).toHaveLength(5)
    expect(artifacts.scripts).toHaveLength(1)
    expect(artifacts.scripts[0].content).toContain('【画面】')
  })

  it('onEvent 回调逐步收到轨迹（SSE 用）', async () => {
    const seq = [toolCallMsg('fetch_hot_topics', { platform: 'douyin' }), answerMsg('OK')]
    const events = []
    const { trajectory } = await runAgent(
      { goal: 'x', platform: 'douyin' },
      { llm: fakeLLM(seq), onEvent: (step) => events.push(step) },
    )
    expect(events).toHaveLength(trajectory.length)
    expect(events.map((e) => e.type)).toEqual(['tool', 'answer'])
  })

  it('单工具出错不中断循环，错误作为 observation 回灌', async () => {
    const seq = [toolCallMsg('unknown_tool', {}), answerMsg('继续')]
    const { trajectory } = await runAgent(
      { goal: 'x', platform: 'douyin' },
      { llm: fakeLLM(seq) },
    )
    expect(trajectory[0].type).toBe('tool')
    expect(trajectory[0].result.error).toContain('未知工具')
    expect(trajectory[1].type).toBe('answer')
  })

  it('模型一直要调工具时，到达最大步数安全截断', async () => {
    const seq = [toolCallMsg('fetch_hot_topics', { platform: 'douyin' })]
    const { truncated, trajectory } = await runAgent(
      { goal: 'x', platform: 'douyin' },
      { llm: fakeLLM(seq) },
    )
    expect(truncated).toBe(true)
    expect(trajectory.every((s) => s.type === 'tool')).toBe(true)
  })

  it('LLM 中途抛错但已有部分轨迹 → 返回 partial', async () => {
    const seq = [toolCallMsg('fetch_hot_topics', { platform: 'douyin' })]
    const explodingLLM = () => {
      let n = 0
      return async () => {
        n += 1
        if (n === 1) return seq[0]
        throw new Error('network down')
      }
    }
    const { partial, trajectory } = await runAgent(
      { goal: 'x', platform: 'douyin' },
      { llm: explodingLLM() },
    )
    expect(partial).toBe(true)
    expect(trajectory).toHaveLength(1)
  })

  it('用户要求保存但 Agent 忘调 save → 自动补保存（真实模式）', async () => {
    const prev = process.env.DEEPSEEK_MOCK
    delete process.env.DEEPSEEK_MOCK // 临时切真实模式，触发自动保存兜底
    try {
      const { maybeAutoSave } = await import('../server/lib/agent.js')
      const auto = await maybeAutoSave({
        goal: '选个话题写脚本并保存到选题库',
        platform: 'douyin',
        artifacts: { scripts: [{ title: '最终选题' }], hotTopics: [{ title: '热榜第一' }], savedItems: [] },
      })
      expect(auto).toBeTruthy()
      expect(auto.record.title).toBe('最终选题') // 优先用最终确定的话题
    } finally {
      if (prev) process.env.DEEPSEEK_MOCK = prev
    }
  })

  it('用户没要求保存 → 不自动补保存', async () => {
    const prev = process.env.DEEPSEEK_MOCK
    delete process.env.DEEPSEEK_MOCK
    try {
      const { maybeAutoSave } = await import('../server/lib/agent.js')
      const auto = await maybeAutoSave({
        goal: '看看今天有什么热点',
        platform: 'douyin',
        artifacts: { scripts: [{ title: 'x' }], hotTopics: [], savedItems: [] },
      })
      expect(auto).toBeNull()
    } finally {
      if (prev) process.env.DEEPSEEK_MOCK = prev
    }
  })

  it('已保存过则不重复补存；没有可用素材也不补存', async () => {
    const prev = process.env.DEEPSEEK_MOCK
    delete process.env.DEEPSEEK_MOCK
    try {
      const { maybeAutoSave } = await import('../server/lib/agent.js')
      expect(
        await maybeAutoSave({
          goal: '保存它', platform: 'douyin',
          artifacts: { scripts: [{ title: 'x' }], hotTopics: [], savedItems: [{ id: '1' }] },
        }),
      ).toBeNull()
      expect(
        await maybeAutoSave({
          goal: '保存它', platform: 'douyin',
          artifacts: { scripts: [], hotTopics: [], savedItems: [] },
        }),
      ).toBeNull()
    } finally {
      if (prev) process.env.DEEPSEEK_MOCK = prev
    }
  })
})

describe('工具执行器（DEEPSEEK_MOCK=1）', () => {
  it('fetch_hot_topics 返回假热榜且尊重 limit', async () => {
    const r = await executeTool('fetch_hot_topics', { platform: 'douyin', limit: 3 })
    expect(r).toHaveLength(3)
    expect(r[0]).toHaveProperty('title')
    expect(r[0]).toHaveProperty('hot')
  })

  it('generate_script 返回脚本文本', async () => {
    const r = await executeTool('generate_script', { title: '测试', type: 'script', platform: 'douyin' })
    expect(r.type).toBe('script')
    expect(r.result).toContain('【画面】')
  })

  it('save_to_library 返回已保存记录', async () => {
    const r = await executeTool('save_to_library', { title: '测试选题', platform: 'rednote' })
    expect(r.status).toBe('saved')
    expect(r.id).toBeTruthy()
  })

  it('search_reference 返回参考角度', async () => {
    const r = await executeTool('search_reference', { query: '美食', platform: 'douyin' })
    expect(r.query).toBe('美食')
    expect(Array.isArray(r.generic)).toBe(true)
    expect(r.generic.length).toBeGreaterThan(0)
  })

  it('plan_schedule 返回 3 天排期', async () => {
    const r = await executeTool('plan_schedule', { title: '测试', platform: 'bili' })
    expect(r.suggestions).toHaveLength(3)
    expect(r.suggestions[0]).toHaveProperty('date')
    expect(r.suggestions[0]).toHaveProperty('slot')
  })

  it('未知工具直接抛错', async () => {
    await expect(executeTool('nope', {})).rejects.toThrow('未知工具')
  })
})

// 防未使用告警
void vi
