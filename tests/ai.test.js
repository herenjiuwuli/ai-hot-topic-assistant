// LLM 调用层（lib/ai.js）单测：stub 掉全局 fetch，一个字节都不发出去。
// 之前这个文件行覆盖是 0% —— 也就是说「key 没配会抛什么错」「上游 500 怎么报」
// 这两件线上真会遇到的事，一直没被任何测试锁定过。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chatWithDeepSeek, chatWithTools } from '../server/lib/ai.js'

let savedEnv

beforeEach(() => {
  savedEnv = { ...process.env }
  process.env.DEEPSEEK_API_KEY = 'sk-test'
  delete process.env.DEEPSEEK_BASE_URL
})

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k]
  Object.assign(process.env, savedEnv)
  vi.unstubAllGlobals()
})

// 造一个 Response 形状的最小对象
function fakeResponse({ ok = true, status = 200, body = '{}' } = {}) {
  return {
    ok,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  }
}

describe('chatWithDeepSeek', () => {
  it('没有 API key 时立刻抛指定错误（路由据此返回 503 而不是 500）', async () => {
    delete process.env.DEEPSEEK_API_KEY
    await expect(chatWithDeepSeek([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'DEEPSEEK_API_KEY not configured'
    )
  })

  it('返回 choices[0].message.content 的文本', async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse({ body: JSON.stringify({ choices: [{ message: { content: '你好' } }] }) })
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(chatWithDeepSeek([{ role: 'user', content: 'hi' }])).resolves.toBe('你好')
  })

  it('请求体带 response_format=json_object（选题接口靠它保证拿到 JSON）', async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse({ body: JSON.stringify({ choices: [{ message: { content: '{}' } }] }) })
    )
    vi.stubGlobal('fetch', fetchMock)
    await chatWithDeepSeek([{ role: 'user', content: 'hi' }])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('deepseek-chat')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages).toHaveLength(1)
  })

  it('DEEPSEEK_BASE_URL 能改域名（换代理/私有网关时不用改代码）', async () => {
    process.env.DEEPSEEK_BASE_URL = 'https://gw.internal'
    const fetchMock = vi.fn(async () =>
      fakeResponse({ body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) })
    )
    vi.stubGlobal('fetch', fetchMock)
    await chatWithDeepSeek([{ role: 'user', content: 'hi' }])
    expect(fetchMock.mock.calls[0][0]).toBe('https://gw.internal/v1/chat/completions')
  })

  it('上游非 2xx 时抛出带状态码和响应体的错误（排障时这两样都要有）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ ok: false, status: 429, body: 'rate limited' })))
    await expect(chatWithDeepSeek([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /DeepSeek API error \(429\): rate limited/
    )
  })

  it('响应里没有 choices 时返回空串，不抛 undefined 相关错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ body: JSON.stringify({}) })))
    await expect(chatWithDeepSeek([{ role: 'user', content: 'hi' }])).resolves.toBe('')
  })
})

describe('chatWithTools（Agent 循环用）', () => {
  it('返回完整 message 对象（含 tool_calls），而不是字符串', async () => {
    const message = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'x', arguments: '{}' } }] }
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ body: JSON.stringify({ choices: [{ message }] }) })))
    const got = await chatWithTools([{ role: 'user', content: 'hi' }], [{ type: 'function', function: { name: 'x' } }])
    expect(got.tool_calls[0].id).toBe('c1')
  })

  it('请求体带 tools + tool_choice=auto，且不带 response_format（两者互斥）', async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse({ body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }) })
    )
    vi.stubGlobal('fetch', fetchMock)
    const tools = [{ type: 'function', function: { name: 'fetch_hot_topics' } }]
    await chatWithTools([{ role: 'user', content: 'hi' }], tools)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.tools).toEqual(tools)
    expect(body.tool_choice).toBe('auto')
    expect(body.response_format).toBeUndefined()
  })

  it('没有 API key 时抛同一个错误（Agent 路由据此回 503）', async () => {
    delete process.env.DEEPSEEK_API_KEY
    await expect(chatWithTools([], [])).rejects.toThrow('DEEPSEEK_API_KEY not configured')
  })

  it('上游非 2xx 时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ ok: false, status: 500, body: 'boom' })))
    await expect(chatWithTools([], [])).rejects.toThrow(/\(500\)/)
  })

  it('响应缺 message 时返回空对象，Agent 循环会当成"没有 tool_calls"直接收尾', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ body: JSON.stringify({ choices: [{}] }) })))
    await expect(chatWithTools([], [])).resolves.toEqual({})
  })
})
