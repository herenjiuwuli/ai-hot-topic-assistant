import { Router } from 'express'
import { chatWithDeepSeek } from '../lib/ai.js'

const router = Router()

router.post('/api/script', async (req, res) => {
  try {
    const { title, angle, platform, type, tags } = req.body || {}
    if (!title || !type) {
      return res.status(400).json({ error: '缺少 title 或 type 参数' })
    }
    if (!['script', 'copy'].includes(type)) {
      return res.status(400).json({ error: 'type 必须为 script 或 copy' })
    }

    const tagStr = Array.isArray(tags) && tags.length > 0 ? tags.join(', ') : '无'
    const platformName = platform === 'douyin' ? '抖音' : platform === 'rednote' ? '小红书' : 'B站'

    const systemPrompt = '你是为 MCN 达人运营写内容的 AI。请根据选题信息和创作类型，生成高质量的内容。'
    let userPrompt = ''
    if (type === 'script') {
      userPrompt = `【选题】${title}\n【创作角度】${angle || '无'}\n【平台】${platformName}\n【话题标签】${tagStr}\n\n请生成一份短视频分镜脚本，包含[画面][口播][时长]结构，500字以内。返回 JSON 格式: {"result": "脚本内容"}`
    } else {
      userPrompt = `【选题】${title}\n【创作角度】${angle || '无'}\n【平台】${platformName}\n【话题标签】${tagStr}\n\n请生成一篇小红书风格图文文案，含标题+正文+emoji+话题标签，500字以内。返回 JSON 格式: {"result": "文案内容"}`
    }

    const raw = await chatWithDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    // 解析 JSON
    let result = ''
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(cleaned)
      result = parsed.result || (typeof parsed === 'string' ? parsed : '')
    } catch {
      // 尝试直接取字符串
      result = raw.trim()
    }

    if (!result) {
      return res.status(502).json({ error: 'AI 返回格式异常，请稍后重试' })
    }

    res.json({ type, title, result })
  } catch (err) {
    if (err.message === 'DEEPSEEK_API_KEY not configured') {
      return res.status(503).json({ error: 'DEEPSEEK_API_KEY not configured' })
    }
    console.error('Script API error:', err)
    res.status(500).json({ error: err.message || '生成内容失败' })
  }
})

export default router