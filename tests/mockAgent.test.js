// 演示用假 LLM（lib/mockAgent.js）单测。
// 这个文件是「免 key 演示路径」，也就是 demo/面试现场会走的那条路 ——
// 它一旦和真工具签名不一致，演示当场就断，可它之前 0% 覆盖。
import { describe, it, expect } from 'vitest'
import { chatWithTools } from '../server/lib/mockAgent.js'

// 构造第 n 轮对话：user 消息 + n 条 tool 结果
function turn(n, { platform = 'douyin', firstToolResult } = {}) {
  const messages = [
    { role: 'system', content: '你是选题 Agent' },
    { role: 'user', content: `做个选题\n[平台: ${platform}]` },
  ]
  for (let i = 0; i < n; i++) {
    messages.push({ role: 'tool', tool_call_id: `t${i}`, content: i === 0 && firstToolResult ? firstToolResult : '[]' })
  }
  return messages
}

const nameOf = (msg) => msg.tool_calls?.[0]?.function.name
const argsOf = (msg) => JSON.parse(msg.tool_calls[0].function.arguments)

describe('mockAgent — 多工具编排顺序', () => {
  it('第 1 轮（还没工具结果）先取热榜，参数里带平台和条数', async () => {
    const msg = await chatWithTools(turn(0, { platform: 'bili' }), [])
    expect(nameOf(msg)).toBe('fetch_hot_topics')
    expect(argsOf(msg)).toMatchObject({ platform: 'bili', limit: 10 })
  })

  it('第 2 轮接着查运营知识库（而不是直接编内容）', async () => {
    const msg = await chatWithTools(turn(1), [])
    expect(nameOf(msg)).toBe('search_knowledge')
    expect(argsOf(msg).query).toBeTruthy()
  })

  it('第 3 轮找参考角度，query 截取热榜标题前 10 个字', async () => {
    const first = JSON.stringify([{ title: '一个特别长的热榜标题超过十个字了' }])
    const msg = await chatWithTools(turn(2, { firstToolResult: first }), [])
    expect(nameOf(msg)).toBe('search_reference')
    expect(argsOf(msg).query).toBe('一个特别长的热榜标题')
  })

  it('第 4 轮生成脚本，标题沿用热榜第一条（不是自己编的）', async () => {
    const first = JSON.stringify([{ title: '漫展现场的十种穿搭' }])
    const msg = await chatWithTools(turn(3, { firstToolResult: first }), [])
    expect(nameOf(msg)).toBe('generate_script')
    expect(argsOf(msg).title).toBe('漫展现场的十种穿搭')
    expect(argsOf(msg).type).toBe('script')
  })

  it('第 5 轮一次并行调两个工具（保存 + 排期），证明循环支持单轮多 call', async () => {
    const msg = await chatWithTools(turn(4), [])
    expect(msg.tool_calls).toHaveLength(2)
    expect(msg.tool_calls.map((c) => c.function.name)).toEqual(['save_to_library', 'plan_schedule'])
  })

  it('工具用完就收尾给出终答，不会无限循环（否则真实模式会烧满 MAX_ITER）', async () => {
    const msg = await chatWithTools(turn(5), [])
    expect(msg.tool_calls).toBeUndefined()
    expect(msg.content).toContain('mock')
    expect(msg.content).toContain('生成短视频脚本')
  })
})

describe('mockAgent — 平台识别', () => {
  it('用户消息里说小红书 → rednote', async () => {
    const msg = await chatWithTools(turn(0, { platform: '小红书' }), [])
    expect(argsOf(msg).platform).toBe('rednote')
  })

  it('B站 → bili', async () => {
    const msg = await chatWithTools(turn(0, { platform: 'B站' }), [])
    expect(argsOf(msg).platform).toBe('bili')
  })

  it('认不出来时默认抖音', async () => {
    const msg = await chatWithTools(turn(0, { platform: '随便哪个' }), [])
    expect(argsOf(msg).platform).toBe('douyin')
  })

  it('system prompt 里出现平台字样不该影响判断（只扫 user 消息，这是踩过的坑）', async () => {
    const messages = [
      { role: 'system', content: '你是小红书运营助手，也懂 B站' },
      { role: 'user', content: '做个选题' },
    ]
    const msg = await chatWithTools(messages, [])
    expect(argsOf(msg).platform).toBe('douyin')
  })
})

describe('mockAgent — 热榜标题提取的容错', () => {
  it('工具结果不是合法 JSON 时退回默认标题，不抛错', async () => {
    const msg = await chatWithTools(turn(3, { firstToolResult: 'not json at all' }), [])
    expect(argsOf(msg).title).toBe('今日热门话题')
  })

  it('工具结果是 { items: [...] } 包一层也能取到标题', async () => {
    const first = JSON.stringify({ items: [{ title: '嵌套结构里的标题' }] })
    const msg = await chatWithTools(turn(3, { firstToolResult: first }), [])
    expect(argsOf(msg).title).toBe('嵌套结构里的标题')
  })

  it('空数组时退回默认标题', async () => {
    const msg = await chatWithTools(turn(3, { firstToolResult: '[]' }), [])
    expect(argsOf(msg).title).toBe('今日热门话题')
  })

  it('每个 tool_call 的 id 唯一（并行两个 call 时 id 撞了会互相覆盖观察结果）', async () => {
    const msg = await chatWithTools(turn(4), [])
    const ids = msg.tool_calls.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
