export async function chatWithDeepSeek(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured')

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
