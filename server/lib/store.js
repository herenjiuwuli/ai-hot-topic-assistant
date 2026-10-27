import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 数据目录：默认仓库内 data/；测试用 AI_HOT_TOPIC_DATA_DIR 指到临时目录做隔离
// ⚠️ 必须惰性读取（函数）而不是模块顶层常量：测试要在 import 之后的 beforeAll 里设 env，
// 顶层常量在模块加载时就固化了，改了也没用 —— 那样测试会写进真实 data/。
function dataDir() {
  return process.env.AI_HOT_TOPIC_DATA_DIR || join(__dirname, '..', '..', 'data')
}

let blobStore = null

async function getBlobStore() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put, get } = await import('@vercel/blob')
    blobStore = { put, get }
  }
  return blobStore
}

export async function readJSON(key) {
  const blob = await getBlobStore()
  if (blob) {
    try {
      const { url } = await blob.get(`${key}.json`)
      const res = await fetch(url)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }
  // Fallback: local fs
  const filePath = join(dataDir(), `${key}.json`)
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function writeJSON(key, data) {
  const blob = await getBlobStore()
  const jsonStr = JSON.stringify(data, null, 2)
  if (blob) {
    await blob.put(`${key}.json`, jsonStr, {
      contentType: 'application/json',
      access: 'public',
      allowOverwrite: true,
    })
    return
  }
  // Fallback: local fs
  const dir = dataDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(join(dir, `${key}.json`), jsonStr, 'utf-8')
}