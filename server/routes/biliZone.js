import { Router } from 'express'
import { fetchBiliRanking } from '../lib/hotlistSource.js'

const router = Router()

router.get('/api/bili-zone', async (req, res) => {
  try {
    const rid = parseInt(req.query.rid, 10) || 0
    const items = await fetchBiliRanking(rid)
    res.json({ platform: 'bili', count: items.length, items, zoneId: rid })
  } catch (err) {
    console.error('Bili zone error:', err)
    res.status(500).json({ error: err.message || 'B站分区数据获取失败' })
  }
})

export default router