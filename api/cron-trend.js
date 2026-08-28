// Vercel Cron：每小时抓取 3 平台实时热榜并存快照，供趋势追踪页使用
// 部署后在 vercel.json 的 crons 里注册：schedule "0 * * * *"
// 本地测试：DEEPSEEK_MOCK=1 node -e "import('./api/cron-trend.js').then(m=>m.default({},{json:(x)=>console.log(x),status:(s)=>({json:(x)=>console.log('status',s,x)})}))"
import { fetchAndNormalize, saveSnapshot } from '../server/lib/hotlistSource.js'

const PLATFORMS = ['douyin', 'rednote', 'bili']

export default async function handler(_req, res) {
  const today = new Date().toISOString().slice(0, 10)
  const saved = []

  for (const platform of PLATFORMS) {
    try {
      const items = await fetchAndNormalize(platform)
      await saveSnapshot(today, platform, items)
      saved.push({ platform, count: items.length, status: 'ok' })
    } catch (err) {
      saved.push({ platform, status: 'error', error: err.message })
    }
  }

  const okCount = saved.filter((s) => s.status === 'ok').length
  res.json({ ok: okCount === PLATFORMS.length, date: today, saved })
}
