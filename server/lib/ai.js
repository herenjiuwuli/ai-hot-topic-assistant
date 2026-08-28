export async function chatWithDeepSeek(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`DeepSeek API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * 工具调用版 chat：用于 Agent 循环。
 * 与 chatWithDeepSeek 不同：
 *  - 接收 tools 参数（DeepSeek/OpenAI 兼容的 function 定义数组）
 *  - 不传 response_format（与 tools 冲突）
 *  - 返回「完整 message 对象」（含可能的 tool_calls），而非 content 字符串
 *    这样调用方才能把带 tool_calls 的助手消息原样回灌，继续多轮推理。
 */
export async function chatWithTools(messages, tools) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      tools,
      tool_choice: 'auto',
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`DeepSeek API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message || {}
}
