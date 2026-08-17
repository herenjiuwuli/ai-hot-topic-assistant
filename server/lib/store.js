import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', '..', 'data')

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
  const filePath = join(DATA_DIR, `${key}.json`)
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
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
  await writeFile(join(DATA_DIR, `${key}.json`), jsonStr, 'utf-8')
}