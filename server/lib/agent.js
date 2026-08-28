// Agent 核心：ReAct 风格的多步推理循环
// 流程：思考(调LLM) → 若模型要调工具 → 执行工具 → 把结果回灌 → 再思考 → … → 直到模型直接给终答
import { chatWithTools } from './ai.js'
import { chatWithTools as mockChatWithTools } from './mockAgent.js'
import { TOOLS, executeTool } from './tools.js'
import { saveTopic } from '../routes/savedTopics.js'

// 安全上限：防止模型一直调工具停不下来（无限循环/烧钱）
const MAX_ITER = 8

const SYSTEM_PROMPT = `你是一个帮 MCN 达人运营做选题与内容的 AI Agent。
你可以通过调用工具来完成任务，而不是直接凭空回答：
- fetch_hot_topics：需要从实时热榜获取素材时使用（先拿数据再产出内容）。
- search_reference：需要找参考角度/竞品选题时使用（按关键词检索）。
- search_knowledge：需要贴合账号定位、规避平台雷区、或参考往期爆款时，先检索运营知识库再生成内容。
- generate_script：需要为某个选题生成短视频脚本或小红书文案时使用。
- save_to_library：用户要求"保存/收藏/入库"时，把选题写入选题库。
- plan_schedule：用户要求"排期/什么时候发"时，生成未来 7 天的发布时段建议。

工作原则（多工具编排）：
1. 基于热榜做选题/写内容：先 fetch_hot_topics 拿数据，再视需要 search_reference 找角度。
2. 凡涉及「账号人设/平台规则/雷区/往期打法」的选题，先调用 search_knowledge 查资料，把知识片段作为依据再产出，避免凭空编造。
3. 确定选题后：generate_script 产出内容；用户要求保存/排期时，再调 save_to_library / plan_schedule。
4. 可以一次并行调用多个互不依赖的工具（如同一轮的保存+排期）。
5. 工具调用次数不要过多（最多几次就够），最终用自然语言总结你做了什么、给出了什么。
6. 保存规则：用户要求"保存/收藏/入库"时，必须调用 save_to_library，且 title 必须用你最终确定（刚生成脚本或选定）的那个选题标题，禁止换成别的。
请始终用中文回答。`

// 运行一次 Agent 任务，返回 { answer, trajectory, artifacts, truncated?, partial? }
// opts.llm     — 注入假 LLM（测试用）；默认按 DEEPSEEK_MOCK 选 mock 或真实 DeepSeek
// opts.onEvent — 每产生一步轨迹回调（SSE 流式用），签名 onEvent(step)
export async function runAgent({ goal, platform }, { llm: llmOverride, onEvent } = {}) {
  const useMock = process.env.DEEPSEEK_MOCK === '1'
  const llm = llmOverride || (useMock ? mockChatWithTools : chatWithTools)

  const userContent = platform ? `${goal}\n[平台: ${platform}]` : goal

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]

  const trajectory = []
  const pushStep = (step) => {
    trajectory.push(step)
    onEvent?.(step)
  }

  const finish = async (extra = {}) => {
    // artifacts：把工具结果提炼成前端可直接渲染的结构化产物（不给用户看技术轨迹）
    const artifacts = buildArtifacts(trajectory)
    // 兜底：用户明确要求保存、但 Agent 忘了调 save_to_library → 用最终选题自动补存
    const auto = await maybeAutoSave({ goal, platform, artifacts })
    if (auto) {
      artifacts.savedItems.push(auto.record)
      extra.autoSaved = auto.record
    }
    return { trajectory, artifacts, ...extra }
  }

  try {
    for (let i = 0; i < MAX_ITER; i++) {
      const msg = await llm(messages, TOOLS)

      // 模型要调工具：把这条带 tool_calls 的助手消息原样保留，逐个执行后回灌
      if (msg.tool_calls && msg.tool_calls.length) {
        messages.push(msg)

        for (const call of msg.tool_calls) {
          let args = {}
          try {
            args = JSON.parse(call.function.arguments || '{}')
          } catch {
            // 参数不是合法 JSON：原样传空，让执行器报错并被下方 catch 捕获
          }

          let result
          try {
            result = await executeTool(call.function.name, args)
          } catch (e) {
            // 单个工具出错不要中断整个循环：把错误作为 observation 回灌给模型
            result = { error: e.message }
          }

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          })
          pushStep({
            type: 'tool',
            name: call.function.name,
            args,
            result,
          })
        }
        continue // 带着工具结果再问一次模型
      }

      // 没有 tool_calls = 模型给出终答
      const answer = msg.content || ''
      pushStep({ type: 'answer', content: answer })
      return { answer, ...(await finish()) }
    }

    // 跑到上限还没终答：安全兜底
    return {
      answer: '（已达最大步数，已停止）如需继续，请拆分任务或调整目标。',
      ...(await finish({ truncated: true })),
    }
  } catch (err) {
    // 降级：LLM 中途挂了（超时/网络/坏 key）但已有部分轨迹 → 返回部分结果 + 友好提示
    if (trajectory.length > 0) {
      return {
        answer: `（任务中途出错：${err.message}）已返回部分结果，请检查网络或稍后重试。`,
        ...(await finish({ partial: true })),
      }
    }
    // 第一步就挂：没有部分结果可给，抛给路由统一处理
    throw err
  }
}

// 自动保存兜底：用户要求保存但 Agent 没存（模型偶发忘调工具）
// 仅在真实模式生效（mock 演示不写库）；返回 null 表示无需补存
// 导出以便单测直接覆盖决策逻辑（不联网）
export async function maybeAutoSave({ goal, platform, artifacts }) {
  if (process.env.DEEPSEEK_MOCK === '1') return null
  if (!/保存|收藏|入库|选题库/.test(goal || '')) return null
  if (artifacts.savedItems.length > 0) return null

  const title = artifacts.scripts[0]?.title || artifacts.hotTopics[0]?.title
  if (!title) return null

  try {
    const record = await saveTopic({
      title,
      angle: artifacts.scripts[0] ? '' : '基于实时热榜选题',
      why: 'Agent 自动保存（用户要求保存）',
      tags: [],
      platform,
      sourceTopic: artifacts.hotTopics[0]?.title || '',
    })
    return { record }
  } catch {
    return null // 保存失败就静默放弃，不让整个任务失败
  }
}

// 从轨迹里提炼结构化产物（只取成功、无 error 的工具结果）
// 返回：{ hotTopics, scripts, savedItems, schedule, references }
function buildArtifacts(trajectory) {
  const arts = { hotTopics: [], scripts: [], savedItems: [], schedule: [], references: null, knowledge: [] }

  for (const s of trajectory) {
    if (s.type !== 'tool' || !s.result || s.result.error) continue
    const r = s.result

    if (s.name === 'fetch_hot_topics' && Array.isArray(r)) {
      arts.hotTopics = r
    } else if (s.name === 'generate_script' && r.result) {
      arts.scripts.push({
        title: r.title || '未命名',
        type: r.type || 'script',
        content: unwrapResult(r.result), // 兼容 result 里再嵌套 JSON 字符串的情况
      })
    } else if (s.name === 'save_to_library' && r.id) {
      arts.savedItems.push({ id: r.id, title: r.title, platform: r.platform })
    } else if (s.name === 'plan_schedule' && Array.isArray(r.suggestions)) {
      arts.schedule = r.suggestions
    } else if (s.name === 'search_reference' && r) {
      arts.references = { matches: r.matches || [], generic: r.generic || [] }
    } else if (s.name === 'search_knowledge' && typeof r === 'string') {
      arts.knowledge.push(r)
    }
  }

  return arts
}

// generate_script 的结果有时是 {"result":"..."} 的 JSON 字符串，解一层取真正的文本
function unwrapResult(text) {
  const str = String(text || '').trim()
  if (!str.startsWith('{')) return str
  try {
    const parsed = JSON.parse(str)
    return typeof parsed === 'string' ? parsed : parsed.result || str
  } catch {
    return str
  }
}
