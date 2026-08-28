// Vercel Cron 处理器单测：mock 掉 hotlistSource，验证 3 平台抓取 + 快照落库 + 单平台失败隔离
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 工厂里只能引用以 mock 开头的顶层变量
const mockFetch = vi.fn()
const mockSave = vi.fn()

vi.mock('../server/lib/hotlistSource.js', () => ({
  fetchAndNormalize: (...args) => mockFetch(...args),
  saveSnapshot: (...args) => mockSave(...args),
}))

import handler from '../api/cron-trend.js'

function fakeRes() {
  return { json: vi.fn() }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockSave.mockReset()
})

describe('cron-trend', () => {
  it('成功抓取 3 平台并存快照', async () => {
    mockFetch.mockResolvedValue([{ title: 'a' }, { title: 'b' }])
    const res = fakeRes()
    await handler({}, res)

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockSave).toHaveBeenCalledTimes(3)
    const body = res.json.mock.calls[0][0]
    expect(body.ok).toBe(true)
    expect(body.saved).toHaveLength(3)
    expect(body.saved.every((s) => s.status === 'ok')).toBe(true)
  })

  it('某平台失败不影响其他平台', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([{ title: 'a' }])
    const res = fakeRes()
    await handler({}, res)

    const body = res.json.mock.calls[0][0]
    expect(body.ok).toBe(false)
    expect(body.saved[0].status).toBe('error')
    expect(body.saved[0].error).toBe('boom')
    expect(body.saved[1].status).toBe('ok')
    // 失败的平台不写快照
    expect(mockSave).toHaveBeenCalledTimes(2)
  })
})
