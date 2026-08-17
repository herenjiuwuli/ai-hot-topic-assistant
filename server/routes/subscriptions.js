import { Router } from 'express'
import { readJSON, writeJSON } from '../lib/store.js'

const router = Router()
const KEY = 'subscriptions'

// 获取全部订阅
router.get('/api/subscriptions', async (_req, res) => {
  try {
    const list = (await readJSON(KEY)) || []
    res.json(list)
  } catch (err) {
    res.status(500).json({ error: err.message || '读取订阅失败' })
  }
})

// 新增订阅
router.post('/api/subscriptions', async (req, res) => {
  try {
    const { keyword } = req.body || {}
    if (!keyword || !keyword.trim()) return res.status(400).json({ error: '缺少 keyword' })
    const list = (await readJSON(KEY)) || []
    const k = keyword.trim()
    if (list.some((s) => s.keyword === k)) return res.status(409).json({ error: '该关键词已订阅' })
    const record = { id: Date.now().toString(36), keyword: k }
    list.push(record)
    await writeJSON(KEY, list)
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message || '新增订阅失败' })
  }
})

// 删除订阅
router.delete('/api/subscriptions/:id', async (req, res) => {
  try {
    const list = (await readJSON(KEY)) || []
    const next = list.filter((s) => s.id !== req.params.id)
    await writeJSON(KEY, next)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message || '删除订阅失败' })
  }
})

export default router