// 选题库（saved_topics）读写单测：真 fs 写临时目录，不碰仓库里的 data/。
// 这个模块是「数据会被弄丢」风险最高的地方 —— 它是唯一会覆写整个数组的接口，
// 所以重点测：局部更新会不会把没传的字段冲掉、发布状态的时间戳会不会被重复刷新。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { writeFile, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { withServer, useTempDataDir } from './_helpers.js'

let cleanupData
let dataDirPath

beforeAll(async () => {
  cleanupData = await useTempDataDir()
  dataDirPath = process.env.AI_HOT_TOPIC_DATA_DIR
})

afterAll(async () => {
  await cleanupData()
})

// 每例前把选题库清空，避免用例之间互相污染
beforeEach(async () => {
  await writeFile(join(dataDirPath, 'saved_topics.json'), '[]', 'utf-8')
})

const post = (request, body) => request('POST', '/api/saved-topics', body)
const list = (request) => request('GET', '/api/saved-topics')

describe('GET /api/saved-topics', () => {
  it('空库返回空数组而不是报错（前端初始态直接渲染空列表）', async () => {
    await withServer(async ({ request }) => {
      const res = await list(request)
      expect(res.status).toBe(200)
      expect(res.json).toEqual([])
    })
  })

  it('文件不存在时也返回空数组（首次部署的初始状态）', async () => {
    const { rm } = await import('node:fs/promises')
    await rm(join(dataDirPath, 'saved_topics.json'), { force: true })
    await withServer(async ({ request }) => {
      const res = await list(request)
      expect(res.status).toBe(200)
      expect(res.json).toEqual([])
    })
  })

  it('按 createdAt 倒序返回，最新的在最前面', async () => {
    await writeFile(
      join(dataDirPath, 'saved_topics.json'),
      JSON.stringify([
        { id: 'a', title: '旧', platform: 'douyin', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', title: '新', platform: 'douyin', createdAt: '2026-09-01T00:00:00.000Z' },
      ]),
      'utf-8'
    )
    await withServer(async ({ request }) => {
      const res = await list(request)
      expect(res.json.map((r) => r.id)).toEqual(['b', 'a'])
    })
  })
})

describe('POST /api/saved-topics', () => {
  it('缺 title 或 platform 返回 400', async () => {
    await withServer(async ({ request }) => {
      expect((await post(request, { platform: 'douyin' })).status).toBe(400)
      expect((await post(request, { title: 'x' })).status).toBe(400)
    })
  })

  it('保存成功后记录自带 id / status / createdAt，前端不用补算', async () => {
    await withServer(async ({ request }) => {
      const res = await post(request, { title: '选题A', angle: '角度', platform: 'rednote', tags: ['cos'] })
      expect(res.status).toBe(200)
      expect(res.json.id).toBeTruthy()
      expect(res.json.status).toBe('saved')
      expect(res.json.publishedAt).toBeNull()
      expect(Number.isNaN(Date.parse(res.json.createdAt))).toBe(false)
      expect(res.json.tags).toEqual(['cos'])
    })
  })

  it('落盘了才算成功：接口返回后直接读文件能读到（不是只存在内存里）', async () => {
    await withServer(async ({ request }) => {
      await post(request, { title: '选题B', platform: 'douyin' })
    })
    const raw = JSON.parse(await readFile(join(dataDirPath, 'saved_topics.json'), 'utf-8'))
    expect(raw).toHaveLength(1)
    expect(raw[0].title).toBe('选题B')
  })

  it('同一毫秒连续保存两条，id 不重复（时间戳做种子必须加随机后缀）', async () => {
    await withServer(async ({ request }) => {
      const [a, b] = await Promise.all([
        post(request, { title: 'x1', platform: 'douyin' }),
        post(request, { title: 'x2', platform: 'douyin' }),
      ])
      expect(a.json.id).not.toBe(b.json.id)
    })
  })

  it('tags 不是数组时归一成空数组，避免前端 .map 崩', async () => {
    await withServer(async ({ request }) => {
      const res = await post(request, { title: 'x', platform: 'douyin', tags: '标签' })
      expect(res.json.tags).toEqual([])
    })
  })

  it('数据目录不存在时会自动创建（换机器/清空 data 后仍能写）', async () => {
    const { rm, stat } = await import('node:fs/promises')
    await rm(dataDirPath, { recursive: true, force: true })
    await withServer(async ({ request }) => {
      const res = await post(request, { title: 'y', platform: 'douyin' })
      expect(res.status).toBe(200)
    })
    const st = await stat(join(dataDirPath, 'saved_topics.json')).catch(() => null)
    expect(st).not.toBeNull()
    const files = await readdir(dataDirPath)
    expect(files).toContain('saved_topics.json')
  })
})

describe('PUT /api/saved-topics/:id', () => {
  it('不存在的 id 返回 404（不能悄悄当新增）', async () => {
    await withServer(async ({ request }) => {
      const res = await request('PUT', '/api/saved-topics/nope', { title: 'x' })
      expect(res.status).toBe(404)
    })
  })

  it('只传 status 时其余字段保持原值（局部更新不能把没传的字段冲成 undefined）', async () => {
    await withServer(async ({ request }) => {
      const created = await post(request, { title: '原标题', angle: '原角度', why: '原理由', platform: 'bili', tags: ['t'] })
      const res = await request('PUT', `/api/saved-topics/${created.json.id}`, { status: 'published' })
      expect(res.json.title).toBe('原标题')
      expect(res.json.angle).toBe('原角度')
      expect(res.json.why).toBe('原理由')
      expect(res.json.tags).toEqual(['t'])
      expect(res.json.status).toBe('published')
      expect(res.json.publishedAt).toBeTruthy()
    })
  })

  it('再次发布不覆盖首次发布时间（发布时间是"第一次发"的时间，不是最后一次操作时间）', async () => {
    await withServer(async ({ request }) => {
      const created = await post(request, { title: 'x', platform: 'douyin' })
      const first = await request('PUT', `/api/saved-topics/${created.json.id}`, { status: 'published' })
      const stamp = first.json.publishedAt
      const second = await request('PUT', `/api/saved-topics/${created.json.id}`, { status: 'published', title: '改了标题' })
      expect(second.json.publishedAt).toBe(stamp)
      expect(second.json.title).toBe('改了标题')
    })
  })

  it('可以传空字符串清空某字段（?? 而不是 ||，否则空串被当成未传）', async () => {
    await withServer(async ({ request }) => {
      const created = await post(request, { title: 'x', angle: '有角度', platform: 'douyin' })
      const res = await request('PUT', `/api/saved-topics/${created.json.id}`, { angle: '' })
      expect(res.json.angle).toBe('')
    })
  })
})

describe('DELETE /api/saved-topics/:id', () => {
  it('删除后列表少一条，且只删指定的那条', async () => {
    await withServer(async ({ request }) => {
      const a = await post(request, { title: 'A', platform: 'douyin' })
      await post(request, { title: 'B', platform: 'douyin' })
      const del = await request('DELETE', `/api/saved-topics/${a.json.id}`)
      expect(del.json).toEqual({ success: true })
      const rest = await list(request)
      expect(rest.json.map((r) => r.title)).toEqual(['B'])
    })
  })

  it('删不存在的 id 也返回 success（幂等：重复点删除不该报错）', async () => {
    await withServer(async ({ request }) => {
      const res = await request('DELETE', '/api/saved-topics/not-exist')
      expect(res.status).toBe(200)
      expect(res.json.success).toBe(true)
    })
  })
})
