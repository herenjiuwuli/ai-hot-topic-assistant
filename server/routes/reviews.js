import { Router } from 'express'
import { readJSON, writeJSON } from '../lib/store.js'

const router = Router()
const KEY = 'reviews'

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// 列表
router.get('/api/reviews', async (_req, res) => {
  try {
    const list = (await readJSON(KEY)) || []
    res.json(list)
  } catch (err) {
    res.status(500).json({ error: err.message || '读取复盘数据失败' })
  }
})

// 新增
router.post('/api/reviews', async (req, res) => {
  try {
    const { title, platform, views, likes, date } = req.body || {}
    if (!title || !platform) return res.status(400).json({ error: '缺少 title 或 platform' })
    const viewsNum = Number(views) || 0
    const likesNum = Number(likes) || 0
    const list = (await readJSON(KEY)) || []
    const record = {
      id: newId(),
      title,
      platform,
      views: viewsNum,
      likes: likesNum,
      date: date || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    }
    list.push(record)
    await writeJSON(KEY, list)
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message || '新增复盘失败' })
  }
})

// 更新
router.put('/api/reviews/:id', async (req, res) => {
  try {
    const { title, platform, views, likes, date } = req.body || {}
    const list = (await readJSON(KEY)) || []
    const idx = list.findIndex((r) => r.id === req.params.id)
    if (idx < 0) return res.status(404).json({ error: '记录不存在' })
    const cur = list[idx]
    list[idx] = {
      ...cur,
      title: title ?? cur.title,
      platform: platform ?? cur.platform,
      views: views !== undefined ? Number(views) || 0 : cur.views,
      likes: likes !== undefined ? Number(likes) || 0 : cur.likes,
      date: date ?? cur.date,
    }
    await writeJSON(KEY, list)
    res.json(list[idx])
  } catch (err) {
    res.status(500).json({ error: err.message || '更新复盘失败' })
  }
})

// 删除
router.delete('/api/reviews/:id', async (req, res) => {
  try {
    const list = (await readJSON(KEY)) || []
    const next = list.filter((r) => r.id !== req.params.id)
    await writeJSON(KEY, next)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message || '删除复盘失败' })
  }
})

// 批量导入
router.post('/api/reviews/bulk', async (req, res) => {
  try {
    const { items } = req.body || {}
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '缺少 items 数组' })
    }
    const list = (await readJSON(KEY)) || []
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const added = []
    for (const item of items) {
      if (!item.title) continue
      const record = {
        id: newId(),
        title: item.title,
        platform: item.platform || 'douyin',
        views: Number(item.views) || 0,
        likes: Number(item.likes) || 0,
        date: item.date || today,
        createdAt: now,
      }
      list.push(record)
      added.push(record)
    }
    await writeJSON(KEY, list)
    res.json({ success: true, count: added.length, items: added })
  } catch (err) {
    res.status(500).json({ error: err.message || '批量导入失败' })
  }
})

export default router