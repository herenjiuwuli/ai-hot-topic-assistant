import { Router } from 'express'
import { chatWithDeepSeek } from '../lib/ai.js'
import { getSnapshots, fetchAndNormalize, isValidPlatform } from '../lib/hotlistSource.js'

const router = Router()

router.post('/api/topics', async (req, res) => {
  try {
    const { positioning, platform, topic } = req.body
    if (!positioning || !platform) {
      return res.status(400).json({ error: '缺少定位或平台参数' })
    }
    if (!isValidPlatform(platform)) {
      return res.status(400).json({ error: '非法平台参数' })
    }

    // 获取当日 Top 15 热榜
    const today = new Date().toISOString().slice(0, 10)
    const snapshots = await getSnapshots()
    const snap = snapshots.find((s) => s.date === today && s.platform === platform)

    let hotItems = []
    if (snap && snap.items) {
      hotItems = snap.items.slice(0, 15)
    } else {
      // 快照不存在则直接调 60s API
      try {
        const items = await fetchAndNormalize(platform)
        hotItems = items.slice(0, 15).map((item) => ({
          title: item.title,
          hot: item.hot,
          rank: item.rank,
        }))
      } catch {
        // 静默失败，hotItems 为空则返回错误
      }
    }

    if (hotItems.length === 0) {
      return res.status(503).json({ error: '暂无热榜数据，请先访问热榜页面' })
    }

    // 构造 prompt
    const hotlistText = hotItems.map((item, i) => `${i + 1}. ${item.title}`).join('\n')
    const topicHint = topic
      ? `【用户选中的热榜话题】${topic}\n请重点围绕这个话题，结合账号定位与当日热榜，推荐 5 个切入角度各不相同、可落地的选题。\n`
      : ''

    const raw = await chatWithDeepSeek([
      {
        role: 'system',
        content: '你是为 MCN 达人运营做选题的 AI。请根据账号定位和当天热榜，推荐 5 个选题。',
      },
      {
        role: 'user',
        content: `【账号定位】${positioning}\n【当日热榜 Top 15】\n${hotlistText}\n${topicHint}\n请返回严格 JSON 格式的对象，必须包含一个 "topics" 数组（5个元素），每个元素包含: title(选题标题), angle(创作角度), why(为什么适合该账号定位), tags(话题标签数组)。示例格式：{"topics": [{...}, {...}, ...]}`,
      },
    ])

    // 解析 JSON 响应，容错处理（模型返回的是 { topics: [...] } 对象）
    let topics = []
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(cleaned)
      // 兼容对象格式 { topics: [...] } 和直接数组格式 [...]
      topics = parsed.topics || (Array.isArray(parsed) ? parsed : [])
      if (!Array.isArray(topics)) topics = []
    } catch {
      // 尝试从响应中提取 JSON 数组
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) {
        try {
          topics = JSON.parse(match[0])
        } catch {
          topics = []
        }
      }
    }

    // 校验并规范化
    topics = topics.slice(0, 5).map((t) => ({
      title: t.title || '',
      angle: t.angle || '',
      why: t.why || '',
      tags: Array.isArray(t.tags) ? t.tags : [],
    }))

    if (topics.length === 0) {
      return res.status(502).json({ error: 'AI 返回格式异常，请稍后重试' })
    }

    res.json({ platform, positioning, topics })
  } catch (err) {
    console.error('Topics API error:', err)
    res.status(500).json({ error: err.message || '生成选题失败' })
  }
})

export default router