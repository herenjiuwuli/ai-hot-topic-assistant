// Agent 过程断言：对「工具调用链」做断言，而不只是断言答案对不对。
//
// 为什么要单独一批测试：
// 终态断言（答案里有没有关键词）抓不到 Agent 的典型故障 ——
//   该调工具却凭记忆答、调错工具、参数越界、编一个不存在的工具名。
// 这四种情况下**答案都可能是对的**，所以只有看 trajectory 才看得见。
//
// 依赖 DEEPSEEK_MOCK=1：工具执行器返回演示数据，全程不联网、不耗 key。
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { runAgent } from '../server/lib/agent.js'
import { checkTrajectory, assertTrajectory, summarizeTrajectory } from '../server/lib/trajectory.js'

vi.mock('../server/routes/savedTopics.js', () => ({
  saveTopic: vi.fn(async (rec) => ({ ...rec, id: 'mock_saved', status: 'saved' })),
}))

let seq = 0
const toolCall = (name, args = {}) => ({
  role: 'assistant',
  content: null,
  tool_calls: [
    { id: `call_${++seq}`, type: 'function', function: { name, arguments: JSON.stringify(args) } },
  ],
})
const answer = (content) => ({ role: 'assistant', content })

// 按序列返回，用完重复最后一条（用于测「跑到上限」）
function fakeLLM(sequence) {
  let i = 0
  return async () => sequence[Math.min(i++, sequence.length - 1)]
}

beforeAll(() => {
  process.env.DEEPSEEK_MOCK = '1'
})
afterAll(() => {
  delete process.env.DEEPSEEK_MOCK
})

describe('正常链路：过程断言应该通过', () => {
  it('先拿热榜 → 再出脚本 → 最后给答案：顺序、次数、终答都合规', async () => {
    const llm = fakeLLM([
      toolCall('fetch_hot_topics', { platform: 'douyin', limit: 5 }),
      toolCall('generate_script', { title: '路边摊天花板', type: 'script' }),
      answer('挑了「路边摊天花板」，因为热度最高且贴合人设。'),
    ])
    const { trajectory, answer: text } = await runAgent({ goal: '基于热榜给我一个选题并写脚本' }, { llm })

    // 轨迹形状：两步工具 + 一步终答
    expect(trajectory.filter((s) => s.type === 'tool')).toHaveLength(2)
    expect(trajectory.at(-1).type).toBe('answer')
    expect(text).toContain('路边摊')

    expect(() =>
      assertTrajectory(trajectory, {
        mustCall: ['fetch_hot_topics', 'generate_script'],
        order: ['fetch_hot_topics', 'generate_script'],
        maxCalls: 3,
        requireAnswer: true,
      })
    ).not.toThrow()
  })

  it('每个 tool 步都带 name / args / result（后面所有断言都建立在这三样上）', async () => {
    const llm = fakeLLM([toolCall('fetch_hot_topics', { limit: 3 }), answer('好')])
    const { trajectory } = await runAgent({ goal: '看看热榜' }, { llm })
    const step = trajectory.find((s) => s.type === 'tool')
    expect(step.name).toBe('fetch_hot_topics')
    expect(step.args).toEqual({ limit: 3 })
    expect(step.result).toBeTruthy()
  })
})

describe('四类过程缺陷：必须能被报出来', () => {
  it('① 该调工具却直接答（答案看起来还很像）→ 报「该调却没调」', async () => {
    const llm = fakeLLM([answer('我推荐「路边摊天花板」，因为最近很火。')])
    const { trajectory } = await runAgent({ goal: '基于热榜给我选题' }, { llm })

    // 终态断言会放过它 —— 答案里确实有内容
    expect(trajectory.at(-1).content).toContain('路边摊')

    // 过程断言抓住它
    const problems = checkTrajectory(trajectory, { mustCall: ['fetch_hot_topics'] })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('该调 fetch_hot_topics 却没调')
  })

  it('② 调错工具（问热榜却去查知识库）→ 同时报缺调用与不该调用', async () => {
    const llm = fakeLLM([toolCall('search_knowledge', { query: '热榜怎么选' }), answer('好')])
    const { trajectory } = await runAgent({ goal: '从热榜里挑一个选题' }, { llm })

    const problems = checkTrajectory(trajectory, {
      mustCall: ['fetch_hot_topics'],
      mustNotCall: ['search_knowledge'],
    })
    expect(problems.some((p) => p.includes('该调 fetch_hot_topics 却没调'))).toBe(true)
    expect(problems.some((p) => p.includes('不该调 search_knowledge 却调了'))).toBe(true)
  })

  it('③ 参数越界（topK 传 999）→ 报参数不合规', async () => {
    const llm = fakeLLM([toolCall('search_knowledge', { query: '雷区', topK: 999 }), answer('好')])
    const { trajectory } = await runAgent({ goal: '查一下平台雷区' }, { llm })

    const problems = checkTrajectory(trajectory, {
      mustCall: ['search_knowledge'],
      argRules: {
        search_knowledge: (args) =>
          args.topK !== undefined && (args.topK < 1 || args.topK > 10) ? `topK=${args.topK}，应在 1–10` : null,
      },
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('topK=999')
  })

  it('④ 编造工具名（模型幻觉出一个不存在的工具）→ 报「不存在的工具」', async () => {
    const llm = fakeLLM([toolCall('get_trending', { platform: 'douyin' }), answer('好')])
    const { trajectory } = await runAgent({ goal: '看看趋势' }, { llm })

    // 执行器不认这个工具，会把错误当 observation 回灌（不中断循环）——
    // 所以轨迹里留着这次调用，正是断言要抓的证据
    expect(trajectory.some((s) => s.type === 'tool' && s.name === 'get_trending')).toBe(true)
    const problems = checkTrajectory(trajectory, { requireAnswer: true })
    expect(problems.some((p) => p.includes('不存在的工具「get_trending」'))).toBe(true)
  })
})

describe('边界：截断与死循环前兆', () => {
  it('一直调工具不停 → 跑到 MAX_ITER 截断，过程断言报「没有终答」', async () => {
    // 永远返回 tool_call，从不给答案
    const llm = fakeLLM([toolCall('fetch_hot_topics', {})])
    const { trajectory, truncated } = await runAgent({ goal: '一直查' }, { llm })

    expect(truncated).toBe(true)
    // MAX_ITER 是安全上限（防死循环烧钱），这里顺带把它钉住
    expect(trajectory.filter((s) => s.type === 'tool')).toHaveLength(8)
    const problems = checkTrajectory(trajectory, { requireAnswer: true })
    expect(problems.some((p) => p.includes('没有终答'))).toBe(true)
  })

  it('调用次数超上限 → 报「可能是死循环前兆」', async () => {
    const llm = fakeLLM([
      toolCall('fetch_hot_topics', {}),
      toolCall('fetch_hot_topics', {}),
      toolCall('fetch_hot_topics', {}),
      answer('好'),
    ])
    const { trajectory } = await runAgent({ goal: '查' }, { llm })
    const problems = checkTrajectory(trajectory, { maxCalls: 2 })
    expect(problems.some((p) => p.includes('调用次数过多'))).toBe(true)
  })

  it('顺序断言是子序列：中间夹别的工具不算错，但顺序反了要报', () => {
    const mk = (names) => [
      ...names.map((name) => ({ type: 'tool', name, args: {}, result: {} })),
      { type: 'answer', content: '好' },
    ]
    // 正常：fetch → (中间夹 search_reference) → generate
    expect(checkTrajectory(mk(['fetch_hot_topics', 'search_reference', 'generate_script']), {
      order: ['fetch_hot_topics', 'generate_script'],
    })).toHaveLength(0)

    // 反了：先出脚本再查热榜
    const bad = checkTrajectory(mk(['generate_script', 'fetch_hot_topics']), {
      order: ['fetch_hot_topics', 'generate_script'],
    })
    expect(bad.some((p) => p.includes('调用顺序不对'))).toBe(true)
  })
})

describe('失败时的可读性', () => {
  it('assertTrajectory 抛出的错误里带完整调用链（不然报错只说"不符合预期"，等于没说）', () => {
    const traj = [
      { type: 'tool', name: 'search_knowledge', args: {}, result: {} },
      { type: 'answer', content: '好' },
    ]
    expect(() => assertTrajectory(traj, { mustCall: ['fetch_hot_topics'] })).toThrow(/该调 fetch_hot_topics/)
  })

  it('summarizeTrajectory 把链路压成一行人读的字符串', () => {
    const s = summarizeTrajectory([
      { type: 'tool', name: 'fetch_hot_topics', args: { limit: 5 }, result: {} },
      { type: 'tool', name: 'generate_script', args: {}, result: {} },
      { type: 'answer', content: '这是答案' },
    ])
    expect(s).toContain('fetch_hot_topics({"limit":5})')
    expect(s).toContain('generate_script()')
    expect(s).toContain('answer(这是答案')
  })
})
