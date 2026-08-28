import { Router } from 'express'
import { runAgent } from '../lib/agent.js'

const router = Router()

// POST /api/agent
// body: { goal: string, platform?: 'douyin'|'rednote'|'bili' }
// 返回: { answer, trajectory, truncated?, partial? }
router.post('/api/agent', async (req, res) => {
  try {
    const { goal, platform } = req.body || {}
    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({ error: '缺少 goal 参数（任务目标）' })
    }
    const result = await runAgent({ goal, platform })
    res.json(result)
  } catch (err) {
    if (err.message === 'DEEPSEEK_API_KEY not configured') {
      return res.status(503).json({ error: 'DEEPSEEK_API_KEY not configured（后端未配置，或可设置 DEEPSEEK_MOCK=1 走演示模式）' })
    }
    console.error('Agent API error:', err)
    res.status(500).json({ error: err.message || 'Agent 执行失败' })
  }
})

// POST /api/agent/stream  （SSE：逐步推送轨迹，前端实时展示）
// 事件：step（每步轨迹）/ done（终答汇总）/ error
router.post('/api/agent/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const { goal, platform } = req.body || {}
    if (!goal || typeof goal !== 'string') {
      send('error', { error: '缺少 goal 参数（任务目标）' })
      return res.end()
    }

    const result = await runAgent({ goal, platform }, {
      onEvent: (step) => send('step', step),
    })

    send('done', {
      answer: result.answer,
      artifacts: result.artifacts || {},
      truncated: !!result.truncated,
      partial: !!result.partial,
    })
    res.end()
  } catch (err) {
    if (err.message === 'DEEPSEEK_API_KEY not configured') {
      send('error', { error: 'DEEPSEEK_API_KEY not configured（后端未配置，或可设置 DEEPSEEK_MOCK=1 走演示模式）' })
    } else {
      send('error', { error: err.message || 'Agent 执行失败' })
    }
    res.end()
  }
})

export default router
