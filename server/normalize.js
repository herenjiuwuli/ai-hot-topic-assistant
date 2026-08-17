/**
 * Parse hot value string like "920.8w", "1234k", "1.2亿", "5678万" to number
 */
function parseHotScore(str) {
  if (str == null) return 0
  if (typeof str === 'number') return str
  const s = String(str).trim().toLowerCase()
  const units = [
    { regex: /^([\d.]+)亿$/, multiplier: 1e8 },
    { regex: /^([\d.]+)万$/, multiplier: 1e4 },
    { regex: /^([\d.]+)w$/, multiplier: 1e4 },
    { regex: /^([\d.]+)k$/, multiplier: 1e3 },
  ]
  for (const { regex, multiplier } of units) {
    const match = s.match(regex)
    if (match) {
      return Math.round(parseFloat(match[1]) * multiplier)
    }
  }
  const n = Number(s)
  return isNaN(n) ? 0 : Math.round(n)
}

/**
 * Normalize hotlist data from various platforms to HotItem[]
 * @param {string} platform - 'douyin' | 'rednote'
 * @param {Array} items - raw items from API
 * @returns {Array<{platform, title, hot: number, url, rank: number}>}
 */
export function normalizeHotlist(platform, items) {
  if (!Array.isArray(items)) return []

  if (platform === 'douyin') {
    return items.map((item, index) => ({
      platform: 'douyin',
      title: item.title || '',
      hot: typeof item.hot_value === 'number' ? item.hot_value : 0,
      url: item.link || '',
      rank: index + 1,
    }))
  }

  if (platform === 'rednote') {
    return items.map((item) => ({
      platform: 'rednote',
      title: item.title || '',
      hot: parseHotScore(item.score),
      url: item.link || '',
      rank: typeof item.rank === 'number' ? item.rank : 0,
    }))
  }

  if (platform === 'bili') {
    return items.map((item, index) => ({
      platform: 'bili',
      title: item.title || '',
      hot: typeof item.hot === 'number' ? item.hot : (typeof item.hot_value === 'number' ? item.hot_value : parseHotScore(item.score)),
      url: item.url || item.link || '',
      rank: index + 1,
      zone: item.zone || '',
    }))
  }

  return []
}