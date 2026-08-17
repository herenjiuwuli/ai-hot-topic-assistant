import { normalizeHotlist } from '../normalize.js'
import { readJSON, writeJSON } from './store.js'

const BASE_URL = process.env.HOTLIST_BASE_URL || 'https://60s.viki.moe'
const MIRROR_URL = process.env.HOTLIST_MIRROR_URL || ''
const ENDPOINTS = { douyin: '/v2/douyin', rednote: '/v2/rednote', bili: '/v2/bili' }
const PLATFORMS = ['douyin', 'rednote', 'bili']

const BILI_API_BASE = 'https://api.bilibili.com/x/web-interface/ranking/v2'

export async function fetchBiliRanking(zoneId = 0) {
  const url = `${BILI_API_BASE}?rid=${zoneId}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Bili API HTTP ${res.status}`)
  const json = await res.json()
  if (json.code !== 0) throw new Error(`Bili API error: ${json.message || json.code}`)
  const list = json.data?.list || []
  return list.map((item, index) => ({
    platform: 'bili',
    title: item.title || '',
    hot: item.stat?.view || 0,
    url: `https://www.bilibili.com/video/${item.bvid}`,
    rank: index + 1,
    zone: item.tname || '全站',
  }))
}

export async function fetchBiliZone(zoneId) {
  return fetchBiliRanking(zoneId)
}

export function isValidPlatform(p) {
  return PLATFORMS.includes(p)
}

export async function fetchAndNormalize(platform) {
  const endpoint = ENDPOINTS[platform]
  if (!endpoint) throw new Error(`Unknown platform: ${platform}`)

  // bili 特殊处理：先试 60s，失败回退官方 API
  if (platform === 'bili') {
    let lastError = null
    const urls = [BASE_URL + endpoint]
    if (MIRROR_URL) urls.push(MIRROR_URL + endpoint)
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (!res.ok) { lastError = new Error(`HTTP ${res.status} from ${url}`); continue }
        const raw = await res.json()
        const items = raw.data || []
        if (items.length > 0) return normalizeHotlist(platform, items)
      } catch (err) { lastError = err }
    }
    // 60s 失败，回退官方 API
    try {
      return await fetchBiliRanking(0)
    } catch (fallbackErr) {
      throw lastError || fallbackErr || new Error('Bili endpoints failed')
    }
  }

  const urls = [BASE_URL + endpoint]
  if (MIRROR_URL) urls.push(MIRROR_URL + endpoint)
  let lastError = null
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${url}`)
        continue
      }
      const raw = await res.json()
      return normalizeHotlist(platform, raw.data || [])
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('All endpoints failed')
}

export async function getSnapshots() {
  return (await readJSON('hotlist_snapshots')) || []
}

export async function hasSnapshot(dateStr, platform) {
  const snapshots = await getSnapshots()
  return snapshots.some((s) => s.date === dateStr && s.platform === platform)
}

export async function saveSnapshot(dateStr, platform, items) {
  const snapshots = await getSnapshots()
  const idx = snapshots.findIndex((s) => s.date === dateStr && s.platform === platform)
  const entry = {
    date: dateStr,
    platform,
    items: items.map((item) => ({
      title: item.title,
      hot: item.hot,
      rank: item.rank,
      url: item.url || '',
    })),
    savedAt: new Date().toISOString(),
  }
  if (idx >= 0) snapshots[idx] = entry // 覆盖当天已存在的快照
  else snapshots.push(entry)
  await writeJSON('hotlist_snapshots', snapshots)
}