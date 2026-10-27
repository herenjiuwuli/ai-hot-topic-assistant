#!/usr/bin/env node
// RAG 检索评测（recall@k / MRR）
//
// 为什么需要它：项目里 RAG 的「检索准不准」以前只有感觉，没有数字。一问「你 recall@3 多少」
// 就只能说「感觉还行」——那等于没有工程能力，只有信心。这个脚本把「感觉」换成可复测的指标。
//
// 它评的是「检索层」，不是「生成层」：给定 query，看应该命中的块有没有进 top-k。
// 生成层（模型会不会用这些片段写好东西）不在这个脚本的范围里，硬混进来会算不清归因。
//
// 与 searchKnowledge 的关系：共用同一套 readKnowledgeDir / buildChunks / embed / RagStore，
// topK 默认同样是 3。区别只是它拿结构化 hits，而 searchKnowledge 最后会把 hits 拼成给模型的文本。
//
// 用法：
//   node scripts/eval-rag.mjs                  # 默认 topK=3，provider 取 .env
//   node scripts/eval-rag.mjs --topk 5
//   node scripts/eval-rag.mjs --provider zhipu --json
//   node scripts/eval-rag.mjs --save eval/last-run.json
//
// 为什么不做成 CI 门禁：它要真调 hosted embedding（要 key、要钱、要网）。
// CI 里跑不了就别假装有门禁 —— 那会变成一条永远 skip 的假保护。
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readKnowledgeDir } from '../server/lib/rag/ingest.js'
import { chunkText } from '../server/lib/rag/chunk.js'
import { embed } from '../server/lib/rag/embed.js'
import { RagStore } from '../server/lib/rag/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const EVAL_SET = path.join(REPO_ROOT, 'eval', 'rag-eval-set.json')
const KNOWLEDGE_DIR = path.join(REPO_ROOT, 'knowledge')

function parseArgs(argv) {
  const out = { topk: 3, json: false, save: null, provider: null, maxChars: 450, headingInEmbed: false, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--topk') out.topk = Number(argv[++i]) || 3
    else if (a === '--json') out.json = true
    else if (a === '--quiet') out.quiet = true
    else if (a === '--save') out.save = argv[++i]
    else if (a === '--provider') out.provider = argv[++i]
    else if (a === '--maxchars') out.maxChars = Number(argv[++i]) || 450
    else if (a === '--heading-in-embed') out.headingInEmbed = true
  }
  return out
}

// 与 buildChunks 同逻辑，但允许传 maxChars（用来对比不同块大小对召回的影响）
function buildChunksWith(docs, maxChars) {
  const chunks = []
  for (const doc of docs) {
    for (const c of chunkText(doc.text, { maxChars })) {
      chunks.push({
        id: `${doc.source}#${chunks.length}`,
        text: c.text,
        heading: c.heading || '',
        source: doc.source,
      })
    }
  }
  return chunks
}

function loadEvalSet() {
  if (!fs.existsSync(EVAL_SET)) {
    console.error(`❌ 找不到标注集：${EVAL_SET}`)
    process.exit(1)
  }
  const data = JSON.parse(fs.readFileSync(EVAL_SET, 'utf8'))
  if (!Array.isArray(data.items) || !data.items.length) {
    console.error('❌ 标注集为空或格式不对（需要 items 数组）')
    process.exit(1)
  }
  return data
}

// 标注自检：anchor 必须真的出现在它声称的文档里。
// 不做这一步的话，锚点打错会表现成「检索失败」——把标注 bug 误判成系统 bug，
// 是最容易让人白改一下午的那种错。
function validateLabels(items, chunks) {
  const problems = []
  const specsOf = (it) => [it.expect, ...(it.alsoAccept || [])].filter(Boolean)
  for (const it of items) {
    if (!it.expect) {
      problems.push(`${it.id}: 缺 expect`)
      continue
    }
    for (const spec of specsOf(it)) {
      const { source, anchor } = spec
      if (!source || !anchor) {
        problems.push(`${it.id}: expect/alsoAccept 缺 source 或 anchor`)
        continue
      }
      const srcChunks = chunks.filter((c) => c.source === source)
      if (!srcChunks.length) {
        problems.push(`${it.id}: 知识库里没有名为「${source}」的文档`)
        continue
      }
      if (!srcChunks.some((c) => c.text.includes(anchor))) {
        const elsewhere = chunks.find((c) => c.text.includes(anchor))
        problems.push(
          `${it.id}: 锚点「${anchor}」不在 ${source} 的任何块里` +
            (elsewhere ? `（它其实在 ${elsewhere.id}）` : '（全库都找不到，可能抄错了字）')
        )
      }
    }
  }
  return problems
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.provider) process.env.EMBEDDING_PROVIDER = args.provider

  const provider = (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase()
  const evalSet = loadEvalSet()
  const items = evalSet.items

  const docs = readKnowledgeDir(KNOWLEDGE_DIR)
  const chunks = buildChunksWith(docs, args.maxChars)

  console.log(
    `评测集：${items.length} 条 ｜ 语料：${docs.length} 篇 / ${chunks.length} 块（maxChars=${args.maxChars}）` +
      ` ｜ embedding：${provider} ｜ topK=${args.topk} ｜ heading 参与向量：${args.headingInEmbed ? '是' : '否'}`
  )
  if (provider === 'fake') {
    console.log('⚠️  fake embedding 是 32 维字符哈希，没有语义。这一轮的分数只能证明链路通，不能当质量指标。')
  }

  const problems = validateLabels(items, chunks)
  if (problems.length) {
    console.error('\n❌ 标注自检未通过（这是标注的问题，不是检索的问题）：')
    for (const p of problems) console.error('  - ' + p)
    process.exit(2)
  }

  // 建索引 + 查询向量：都批量一次，避免 N 次网络往返
  const t0 = Date.now()
  // heading 参与向量化：块正文里往往没有小节标题的关键词（"四大内容支柱"只在标题行），
  // 把它拼进被向量化的文本能补回这部分信号；展示给模型的仍然是正文。
  const embedInput = (c) => (args.headingInEmbed && c.heading ? `${c.heading}\n${c.text}` : c.text)
  const chunkVecs = await embed(chunks.map(embedInput))
  const store = new RagStore().set(chunks, chunkVecs)
  const queryVecs = await embed(items.map((it) => it.query))
  const embedMs = Date.now() - t0

  const rows = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const hits = store.search(queryVecs[i], args.topk)

    const match = (h, spec) => h.source === spec.source && h.text.includes(spec.anchor)
    const docRank = hits.findIndex((h) => h.source === it.expect.source)
    // 严格口径：必须命中标注里指定的那一块
    const chunkRank = hits.findIndex((h) => match(h, it.expect))
    // 宽松口径：同时接受 alsoAccept 里的人工「也说得通」答案。
    // 两个口径都输出，是因为「唯一正确答案」这件事在自然语言检索里往往不成立；
    // 只报严格数会把标注歧义算成系统缺陷，只报宽松数又会让指标虚高。
    const altRank = chunkRank >= 0 ? chunkRank : hits.findIndex((h) => (it.alsoAccept || []).some((s) => match(h, s)))
    const acceptedBy = chunkRank >= 0 ? 'expect' : altRank >= 0 ? 'alsoAccept' : null

    rows.push({
      id: it.id,
      query: it.query,
      difficulty: it.difficulty || 'normal',
      expectSource: it.expect.source,
      anchor: it.expect.anchor,
      // 1-based 排名，null 表示没进 top-k
      docRank: docRank < 0 ? null : docRank + 1,
      chunkRank: chunkRank < 0 ? null : chunkRank + 1,
      altRank: altRank < 0 ? null : altRank + 1,
      acceptedBy,
      top: hits.map((h) => ({
        id: h.id,
        source: h.source,
        heading: h.heading,
        score: Number(h.score.toFixed(4)),
        excerpt: h.text.replace(/\s+/g, ' ').slice(0, 60),
      })),
    })
  }

  const n = rows.length
  const rate = (pred) => rows.filter(pred).length / n
  const k = args.topk
  const metrics = {
    docHit1: rate((r) => r.docRank === 1),
    docHit3: rate((r) => r.docRank !== null && r.docRank <= 3),
    chunkHit1: rate((r) => r.chunkRank === 1),
    chunkHit3: rate((r) => r.chunkRank !== null && r.chunkRank <= 3),
    // 宽松口径（含 alsoAccept）；与严格口径的差额 = 标注歧义，不是系统问题
    looseHit1: rate((r) => r.altRank === 1),
    looseHit3: rate((r) => r.altRank !== null && r.altRank <= k),
    // MRR 按块级严格口径算：只命中对的文档、但没命中对的那块，不给分
    mrr: rows.reduce((s, r) => s + (r.chunkRank ? 1 / r.chunkRank : 0), 0) / n,
    mrrLoose: rows.reduce((s, r) => s + (r.altRank ? 1 / r.altRank : 0), 0) / n,
  }

  const pct = (x) => (x * 100).toFixed(1) + '%'
  const byDiff = ['easy', 'normal', 'hard'].map((d) => {
    const sub = rows.filter((r) => r.difficulty === d)
    if (!sub.length) return null
    return {
      difficulty: d,
      count: sub.length,
      chunkHit3: sub.filter((r) => r.chunkRank !== null && r.chunkRank <= 3).length / sub.length,
    }
  }).filter(Boolean)

  const result = {
    ranAt: new Date().toISOString(),
    provider,
    topk: args.topk,
    strategy: { maxChars: args.maxChars, headingInEmbed: args.headingInEmbed },
    corpus: { docs: docs.length, chunks: chunks.length },
    embedMs,
    metrics,
    byDifficulty: byDiff,
    rows,
  }

  if (args.quiet) {
    // 只打一行，方便连着跑多个配置做对比
    console.log(
      `[${provider} maxChars=${args.maxChars} head=${args.headingInEmbed ? 'y' : 'n'}] ` +
        `chunks=${chunks.length} chunkH@1=${pct(metrics.chunkHit1)} chunkH@${k}=${pct(metrics.chunkHit3)} ` +
        `looseH@${k}=${pct(metrics.looseHit3)} docH@3=${pct(metrics.docHit3)} mrr=${metrics.mrr.toFixed(3)}`
    )
  } else if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`\n建索引 + 查询向量耗时 ${embedMs} ms（${chunks.length + n} 次向量化，批量）`)

    console.log('\n== 指标（严格口径 = 必须命中标注指定的那一块）==')
    console.log(`  文档级 Hit@1   ${pct(metrics.docHit1)}    文档级 Hit@3   ${pct(metrics.docHit3)}`)
    console.log(`  块级   Hit@1   ${pct(metrics.chunkHit1)}    块级   Hit@${k}   ${pct(metrics.chunkHit3)}`)
    console.log(`  MRR（块级）    ${metrics.mrr.toFixed(3)}`)
    console.log(
      `\n== 宽松口径（把标注里 alsoAccept 的「也说得通的答案」算对）==\n` +
        `  块级 Hit@1 ${pct(metrics.looseHit1)} ｜ 块级 Hit@${k} ${pct(metrics.looseHit3)} ｜ MRR ${metrics.mrrLoose.toFixed(3)}`
    )
    const gap = metrics.looseHit3 - metrics.chunkHit3
    if (gap > 0) {
      console.log(`  差额 ${pct(gap)} = 标注歧义（同一问题有几个都说得通的块），不是检索缺陷`)
    }

    if (byDiff.length > 1) {
      console.log('\n== 按难度 ==')
      for (const d of byDiff) console.log(`  ${d.difficulty.padEnd(7)} ${d.count} 条   块级 Hit@${args.topk} ${pct(d.chunkHit3)}`)
    }

    console.log('\n== 明细 ==')
    console.log('id    | 块级排名 | 期望来源                     | query')
    for (const r of rows) {
      // ✅ 严格命中第一 ｜ △n 严格命中但排第 n ｜ ◇n 只命中了可接受的替代答案 ｜ ❌ 没命中
      const mark = r.chunkRank === 1 ? '✅' : r.chunkRank ? `△${r.chunkRank}` : r.altRank ? `◇${r.altRank}` : '❌'
      console.log(`${r.id}   |   ${mark.padEnd(6)} | ${r.expectSource.padEnd(20)} | ${r.query}`)
    }

    const misses = rows.filter((r) => r.altRank === null)
    if (misses.length) {
      console.log(`\n== 未命中 ${misses.length} 条（严格与宽松口径都不算对），逐条看它把什么排前面了 ==`)
      for (const r of misses) {
        console.log(`\n[${r.id}] ${r.query}`)
        console.log(`  期望：${r.expectSource} 里含「${r.anchor}」的块`)
        r.top.forEach((h, i) => {
          console.log(`  ${i + 1}. ${h.score.toFixed(4)} ${h.id}  ⟨${h.heading}⟩`)
          console.log(`     ${h.excerpt}`)
        })
      }
    } else {
      console.log('\n全部命中（宽松口径）。')
    }
  }

  if (args.save) {
    fs.mkdirSync(path.dirname(path.resolve(args.save)), { recursive: true })
    fs.writeFileSync(path.resolve(args.save), JSON.stringify(result, null, 2), 'utf8')
    console.log(`\n结果已存：${args.save}`)
  }
}

main().catch((e) => {
  console.error('\n❌ 评测失败：', e.message)
  process.exit(1)
})
