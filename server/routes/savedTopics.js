import { Router } from 'express'
import { readJSON, writeJSON } from '../lib/store.js'

const router = Router()
const KEY = 'saved_topics'

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// 保存选题的核心逻辑（抽出来供 Agent 的 save_to_library 工具复用）
export async function saveTopic({ title, angle, why, tags, platform, sourceTopic }) {
  const list = (await readJSON(KEY)) || []
  const record = {
    id: newId(),
    title,
    angle: angle || '',
    why: why || '',
    tags: Array.isArray(tags) ? tags : [],
    platform,
    sourceTopic: sourceTopic || '',
    status: 'saved',
    createdAt: new Date().toISOString(),
    publishedAt: null,
  }
  list.push(record)
  await writeJSON(KEY, list)
  return record
}

// 列表（按 createdAt 倒序）
router.get('/api/saved-topics', async (_req, res) => {
  try {
    const list = (await readJSON(KEY)) || []
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    res.json(list)
  } catch (err) {
    res.status(500).json({ error: err.message || '读取选题库失败' })
  }
})

// 新增
router.post('/api/saved-topics', async (req, res) => {
  try {
    const { title, angle, why, tags, platform, sourceTopic } = req.body || {}
    if (!title || !platform) return res.status(400).json({ error: '缺少 title 或 platform' })
    const record = await saveTopic({ title, angle, why, tags, platform, sourceTopic })
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message || '保存选题失败' })
  }
})

// 更新
router.put('/api/saved-topics/:id', async (req, res) => {
  try {
    const { title, angle, why, tags, platform, status, sourceTopic } = req.body || {}
    const list = (await readJSON(KEY)) || []
    const idx = list.findIndex((r) => r.id === req.params.id)
    if (idx < 0) return res.status(404).json({ error: '记录不存在' })
    const cur = list[idx]
    const now = new Date().toISOString()
    list[idx] = {
      ...cur,
      title: title ?? cur.title,
      angle: angle ?? cur.angle,
      why: why ?? cur.why,
      tags: tags ?? cur.tags,
      platform: platform ?? cur.platform,
      sourceTopic: sourceTopic ?? cur.sourceTopic,
      status: status ?? cur.status,
      publishedAt: status === 'published' && !cur.publishedAt ? now : cur.publishedAt,
    }
    await writeJSON(KEY, list)
    res.json(list[idx])
  } catch (err) {
    res.status(500).json({ error: err.message || '更新选题失败' })
  }
})

// 删除
router.delete('/api/saved-topics/:id', async (req, res) => {
  try {
    const list = (await readJSON(KEY)) || []
    const next = list.filter((r) => r.id !== req.params.id)
    await writeJSON(KEY, next)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message || '删除选题失败' })
  }
})

export default router