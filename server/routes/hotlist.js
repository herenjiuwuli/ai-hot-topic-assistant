import { Router } from 'express'
import {
  fetchAndNormalize,
  getSnapshots,
  hasSnapshot,
  saveSnapshot,
  isValidPlatform,
} from '../lib/hotlistSource.js'

const router = Router()

router.get('/api/hotlist', async (req, res) => {
  try {
    const platform = req.query.platform
    if (!platform || !isValidPlatform(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Use douyin or rednote.' })
    }

    const today = new Date().toISOString().slice(0, 10)
    let normalized = []
    let fromCache = false

    try {
      normalized = await fetchAndNormalize(platform)
      const exists = await hasSnapshot(today, platform)
      if (!exists && normalized.length > 0) {
        await saveSnapshot(today, platform, normalized)
      }
    } catch (apiErr) {
      // 在线接口失败（429/超时等），回退到本地快照
      console.warn(`Hotlist API failed for ${platform}, falling back to snapshot:`, apiErr.message)
      const snapshots = await getSnapshots()
      const snap = snapshots.find((s) => s.date === today && s.platform === platform)
      if (snap && snap.items && snap.items.length > 0) {
        normalized = snap.items.map((item) => ({ ...item, platform }))
        fromCache = true
      } else {
        const platformSnaps = snapshots
          .filter((s) => s.platform === platform)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        if (platformSnaps.length > 0) {
          normalized = (platformSnaps[0].items || []).map((item) => ({ ...item, platform }))
          fromCache = true
        }
      }
    }

    if (normalized.length === 0) {
      return res.status(503).json({ error: '热榜暂不可用，且无本地缓存数据。请稍后再试。' })
    }

    res.json({ platform, count: normalized.length, items: normalized, fromCache })
  } catch (err) {
    console.error('Hotlist API error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})

export default router