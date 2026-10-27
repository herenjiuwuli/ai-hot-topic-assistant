// 测试公共工具（不以 .test.js 结尾，不会被当成用例文件）
// 两个职责：① 起一个监听随机端口的 Express 实例（不占固定端口、不联网）
//           ② 把数据目录指到临时目录（避免测试污染真实 data/）
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/index.js'

// 启动真实 Express app，监听 0（内核分配端口），跑完必定关掉。
// 用真 HTTP 而不是 mock req/res：这样中间件、路由注册、SSE 头、状态码都是真跑的。
export async function withServer(fn) {
  const app = createApp()
  const server = app.listen(0)
  await once(server, 'listening')
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`

  const request = async (method, path, body) => {
    const init = { method, headers: {} }
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const res = await fetch(base + path, init)
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // SSE / 非 JSON 响应保留原文
    }
    return { status: res.status, json, text, contentType: res.headers.get('content-type') }
  }

  try {
    return await fn({ base, request })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// 把 store.js 的数据目录指到临时目录，返回清理函数。
// 注意：store.js 是惰性读 env 的，所以 import 之后再设也生效。
export async function useTempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), 'ai-hot-topic-test-'))
  const prev = process.env.AI_HOT_TOPIC_DATA_DIR
  process.env.AI_HOT_TOPIC_DATA_DIR = dir
  return async () => {
    if (prev === undefined) delete process.env.AI_HOT_TOPIC_DATA_DIR
    else process.env.AI_HOT_TOPIC_DATA_DIR = prev
    await rm(dir, { recursive: true, force: true })
  }
}
