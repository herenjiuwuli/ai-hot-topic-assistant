import { Router } from 'express'
import {
  fetchAndNormalize,
  getSnapshots,
  saveSnapshot,
  isValidPlatform,
} from '../lib/hotlistSource.js'

const router = Router()

// 手动强制保存当天快照（覆盖已有）
router.post('/api/snapshots', async (req, res) => {
  try {
    const { platform } = req.body || {}
    if (!platform || !isValidPlatform(platform)) {
      return res.status(400).json({ error: '缺少或非法 platform 参数' })
    }
    const today = new Date().toISOString().slice(0, 10)
    const items = await fetchAndNormalize(platform)
    if (items.length === 0) {
      return res.status(503).json({ error: '接口暂无数据，保存失败' })
    }
    await saveSnapshot(today, platform, items)
    res.json({ success: true, platform, date: today, count: items.length })
  } catch (err) {
    console.error('Snapshot save error:', err)
    res.status(500).json({ error: err.message || '保存快照失败' })
  }
})

// 查询快照列表
router.get('/api/snapshots', async (_req, res) => {
  try {
    const snapshots = await getSnapshots()
    res.json(snapshots)
  } catch (err) {
    console.error('Snapshot list error:', err)
    res.status(500).json({ error: err.message || '查询快照失败' })
  }
})

// 近 7 天某热词热度趋势
router.get('/api/trend', async (req, res) => {
  try {
    const { platform, keyword } = req.query
    if (!platform || !isValidPlatform(platform)) {
      return res.status(400).json({ error: '缺少或非法 platform 参数' })
    }
    if (!keyword) return res.status(400).json({ error: '缺少 keyword 参数' })

    const snapshots = await getSnapshots()
    const platformSnaps = snapshots
      .filter((s) => s.platform === platform)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    // 近 7 天连续日期（含今天），缺失日期返回 null 形成断线
    const dates = []
    for (let i = 6; i >= 0; i--) {
      dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
    }
    const snapByDate = new Map(platformSnaps.map((s) => [s.date, s]))

    const series = dates.map((dateStr) => {
      const snap = snapByDate.get(dateStr)
      const item = snap
        ? (snap.items || []).find(
            (i) => i.title === keyword || (keyword && i.title && i.title.includes(keyword))
          )
        : null
      return { date: dateStr, hot: item ? item.hot : null, found: !!item }
    })

    res.json({ platform, keyword, series })
  } catch (err) {
    console.error('Trend error:', err)
    res.status(500).json({ error: err.message || '查询趋势失败' })
  }
})

export default router