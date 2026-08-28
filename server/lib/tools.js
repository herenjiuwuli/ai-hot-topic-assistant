// 工具定义（DeepSeek/OpenAI 兼容的 function calling 格式）+ 执行器
// Phase2 完整工具集：fetch_hot_topics / generate_script / save_to_library / search_reference / plan_schedule
import { fetchAndNormalize } from './hotlistSource.js'
import { generateScript } from '../routes/script.js'
import { saveTopic } from '../routes/savedTopics.js'
import { searchKnowledge } from './tools/searchKnowledge.js'

// 给模型看的「工具清单」——决定它能调用什么、参数长什么样
export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fetch_hot_topics',
      description: '获取指定平台的实时热榜，用于选题参考。当用户需要基于热榜做选题或写内容时先调用它。',
      parameters: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['douyin', 'rednote', 'bili'],
            description: '平台：douyin=抖音，rednote=小红书，bili=B站',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 30,
            default: 10,
            description: '返回热榜条数',
          },
        },
        required: ['platform'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_script',
      description: '按选题生成短视频脚本或小红书文案。拿到热榜后，挑话题调用它产出具体内容。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '选题标题' },
          angle: { type: 'string', description: '创作角度' },
          platform: {
            type: 'string',
            enum: ['douyin', 'rednote', 'bili'],
            description: '平台：douyin=抖音，rednote=小红书，bili=B站',
          },
          type: {
            type: 'string',
            enum: ['script', 'copy'],
            description: 'script=短视频分镜脚本，copy=小红书图文文案',
          },
          tags: { type: 'array', items: { type: 'string' }, description: '话题标签' },
        },
        required: ['title', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_to_library',
      description: '把确定要做的选题保存到选题库。当用户要求"保存/收藏/入库"时使用。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '选题标题' },
          angle: { type: 'string', description: '创作角度' },
          why: { type: 'string', description: '为什么适合该账号' },
          tags: { type: 'array', items: { type: 'string' }, description: '话题标签' },
          platform: {
            type: 'string',
            enum: ['douyin', 'rednote', 'bili'],
            description: '平台：douyin=抖音，rednote=小红书，bili=B站',
          },
          sourceTopic: { type: 'string', description: '来源热榜话题（可选）' },
        },
        required: ['title', 'platform'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_reference',
      description: '检索话题相关的参考资料/竞品选题，帮助找到切入角度。先用关键词在热榜里找，找不到返回通用参考。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词' },
          platform: {
            type: 'string',
            enum: ['douyin', 'rednote', 'bili'],
            description: '平台：douyin=抖音，rednote=小红书，bili=B站',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_schedule',
      description: '为选题生成发布排期建议（未来 7 天的最佳发布时段）。当用户要求"排期/什么时候发"时使用。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '选题标题' },
          platform: {
            type: 'string',
            enum: ['douyin', 'rednote', 'bili'],
            description: '平台：douyin=抖音，rednote=小红书，bili=B站',
          },
          startDate: { type: 'string', description: '开始日期 YYYY-MM-DD（可选，默认明天）' },
        },
        required: ['title', 'platform'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: '检索运营知识库（二次元赛道打法、平台规则与雷区、往期爆款复盘等），用于给选题/脚本提供账号定位、历史打法与合规依据。当需要贴合账号人设、规避平台雷区、或参考往期爆款时先调用它。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词，如「版权雷区」「爆款复盘」「平台适配」' },
          top_k: { type: 'integer', minimum: 1, maximum: 10, default: 3, description: '返回最相关片段数' },
        },
        required: ['query'],
      },
    },
  },
]

// 工具名 → 中文展示名（前端时间线用）
export const TOOL_LABELS = {
  fetch_hot_topics: '抓取实时热榜',
  generate_script: '生成脚本/文案',
  save_to_library: '保存到选题库',
  search_reference: '检索参考资料',
  plan_schedule: '规划排期',
  search_knowledge: '检索运营知识库',
}

// 真正执行工具：name 分发到对应逻辑
export async function executeTool(name, args = {}) {
  // DEEPSEEK_MOCK=1：工具也返回演示数据，全程不联网、不耗 key
  if (process.env.DEEPSEEK_MOCK === '1') {
    return mockToolResult(name, args)
  }

  if (name === 'fetch_hot_topics') {
    const limit = Number(args.limit) || 10
    const items = await fetchAndNormalize(args.platform)
    return items.slice(0, limit).map((i) => ({
      title: i.title,
      hot: i.hot,
      rank: i.rank,
      url: i.url || '',
    }))
  }

  if (name === 'generate_script') {
    if (!args.title || !args.type) {
      throw new Error('generate_script 缺少 title 或 type')
    }
    return await generateScript({
      title: args.title,
      angle: args.angle,
      platform: args.platform,
      type: args.type,
      tags: args.tags,
    })
  }

  if (name === 'save_to_library') {
    if (!args.title || !args.platform) {
      throw new Error('save_to_library 缺少 title 或 platform')
    }
    return await saveTopic({
      title: args.title,
      angle: args.angle,
      why: args.why,
      tags: args.tags,
      platform: args.platform,
      sourceTopic: args.sourceTopic,
    })
  }

  if (name === 'search_reference') {
    return await searchReference(args)
  }

  if (name === 'plan_schedule') {
    if (!args.title || !args.platform) {
      throw new Error('plan_schedule 缺少 title 或 platform')
    }
    return planSchedule(args)
  }

  if (name === 'search_knowledge') {
    return await searchKnowledge(String(args.query || ''), Number(args.top_k) || 3)
  }

  throw new Error(`未知工具: ${name}`)
}

// search_reference：先在平台热榜里按关键词找，找不到返回通用参考选题
async function searchReference({ query, platform }) {
  const kw = String(query || '').trim()
  if (!kw) return { query, matches: [], hint: '未提供关键词' }

  let matches = []
  try {
    const items = await fetchAndNormalize(platform || 'douyin')
    matches = items
      .filter((i) => (i.title || '').includes(kw))
      .slice(0, 5)
      .map((i) => ({ title: i.title, hot: i.hot, rank: i.rank, url: i.url || '' }))
  } catch {
    // 热榜获取失败就只用通用参考
  }

  const generic = [
    `从"为什么越来越多人聊 ${kw}"切入，讲趋势背后的原因`,
    `盘点式内容：${kw} 的 5 个冷知识/避坑点`,
    `争议式话题：「${kw}」到底值不值？正反方观点`,
    `体验式 vlog：带粉丝沉浸式体验一次 ${kw}`,
  ]

  return { query: kw, matches, generic, hint: matches.length ? '热榜命中' : '热榜未命中，已给通用参考角度' }
}

// plan_schedule：确定性排期建议（未来 7 天，每天一个推荐时段）
const PLATFORM_SLOTS = {
  douyin: ['12:00-13:00', '18:00-19:00', '21:00-22:00'],
  rednote: ['11:30-12:30', '19:00-20:00', '21:30-22:30'],
  bili: ['18:00-19:00', '20:00-21:00', '22:00-23:00'],
}

function planSchedule({ title, platform, startDate }) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() + 24 * 3600 * 1000)
  const slots = PLATFORM_SLOTS[platform] || PLATFORM_SLOTS.douyin
  const suggestions = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 24 * 3600 * 1000)
    const dateStr = d.toISOString().slice(0, 10)
    suggestions.push({
      date: dateStr,
      slot: slots[i % slots.length],
      platform,
      title,
      note: i === 0 ? '建议优先发布，蹭热点时效性最强' : '',
    })
  }
  return { title, platform, suggestions, tip: '黄金时段参考：午间/晚间通勤与睡前刷手机高峰' }
}

// 演示模式用的假工具结果（不联网）
function mockToolResult(name, args) {
  if (name === 'fetch_hot_topics') {
    return [
      { title: '【美食】路边摊天花板合集，10元吃到撑', hot: 523000, rank: 1, url: '' },
      { title: '【美食】一份炒饭卖300元，值吗？', hot: 412000, rank: 2, url: '' },
      { title: '【美食】全网都在做的懒人电饭煲焖饭', hot: 388000, rank: 3, url: '' },
      { title: '【美食】夜市必吃榜，老板说从不缺客人', hot: 305000, rank: 4, url: '' },
      { title: '【美食】挑战一周不吃外卖的便当记录', hot: 277000, rank: 5, url: '' },
    ].slice(0, Number(args.limit) || 10)
  }
  if (name === 'generate_script') {
    return {
      type: args.type || 'script',
      title: args.title || '示例选题',
      result:
        '【画面】特写：路边摊老板翻动炒锅，热气腾腾\n【口播】今天带你们吃一家被本地人私藏的路边摊\n【时长】0-3s 钩子：先放大声音和锅气\n【画面】中景：10元一份的炒粉，料超足\n【口播】价格是真实的，料也是真实的\n【时长】3-10s 展示\n【画面】收尾：老板笑着比耶\n【口播】关注我，带你看更多宝藏小店\n【时长】10-15s 引导关注',
    }
  }
  if (name === 'save_to_library') {
    return {
      id: 'mock_' + Date.now().toString(36),
      title: args.title || '示例选题',
      platform: args.platform || 'douyin',
      status: 'saved',
      savedAt: new Date().toISOString(),
    }
  }
  if (name === 'search_reference') {
    const kw = String(args.query || '').trim()
    return {
      query: kw,
      matches: [],
      generic: [
        `从"为什么越来越多人聊 ${kw}"切入，讲趋势背后的原因`,
        `盘点式内容：${kw} 的 5 个冷知识/避坑点`,
        `争议式话题：「${kw}」到底值不值？正反方观点`,
      ],
      hint: '热榜未命中，已给通用参考角度（演示数据）',
    }
  }
  if (name === 'plan_schedule') {
    const slots = PLATFORM_SLOTS[args.platform] || PLATFORM_SLOTS.douyin
    return {
      title: args.title || '示例选题',
      platform: args.platform || 'douyin',
      suggestions: [
        { date: '2026-08-27', slot: slots[0], platform: args.platform || 'douyin', title: args.title || '示例选题', note: '建议优先发布，蹭热点时效性最强' },
        { date: '2026-08-28', slot: slots[1], platform: args.platform || 'douyin', title: args.title || '示例选题', note: '' },
        { date: '2026-08-29', slot: slots[2], platform: args.platform || 'douyin', title: args.title || '示例选题', note: '' },
      ],
      tip: '黄金时段参考：午间/晚间通勤与睡前刷手机高峰',
    }
  }
  if (name === 'search_knowledge') {
    const kw = String(args.query || '').trim()
    return {
      query: kw,
      snippets: [
        '【来源 平台规则与雷区.md｜版权与 IP】cos 属粉丝二创一般平台默许，但商用未授权大 IP（如迪士尼、部分手游）需品牌方已获授权；BGM 直接用番剧原声易被下架，优先用平台音乐库或无版权音乐。',
        '【来源 二次元赛道打法.md｜平台适配】抖音做漏斗引流（前 1 秒反差），B站做深度沉淀，小红书做搜索流量（封面精致+教程/避雷/平替词），微博做互动。一条还原素材可剪 4 种版本。',
        '【来源 往期爆款复盘.md｜抢热点还原】新番/新游角色上线周做高还原正片+原设对比图，踩中热度窗口；评论区主动抛「下一个 cos 谁」承接流量。',
      ],
      hint: '已从运营知识库检索到相关片段（演示数据）',
    }
  }
  throw new Error(`未知工具: ${name}`)
}
