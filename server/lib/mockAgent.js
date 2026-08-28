// 假 LLM：和 ai.js 的 chatWithTools 同签名，但完全不调网络。
// 当后端设置 DEEPSEEK_MOCK=1 时启用，让你免 key 就能跑通 Agent 循环、开发前端。
//
// 行为：根据已发生的「工具结果」决定下一步，模拟一个 4 步工具调用 + 终答 的多工具编排 Agent：
//   第 1 轮（无 tool 消息）→ 调 fetch_hot_topics
//   第 2 轮（1 次工具结果）→ 调 search_reference（搜参考角度）
//   第 3 轮（2 次工具结果）→ 调 generate_script（拿热榜里的标题写脚本）
//   第 4 轮（3 次工具结果）→ 调 save_to_library（保存选题）+ plan_schedule（排期）
//   第 5 轮（4 次工具结果）→ 给出终答
export async function chatWithTools(messages) {
  const toolResults = messages.filter((m) => m.role === 'tool')
  const platform = detectPlatform(messages)
  const title = firstTopicTitle(toolResults)

  if (toolResults.length === 0) {
    return toolCall('call_fetch_1', 'fetch_hot_topics', { platform, limit: 10 })
  }

  if (toolResults.length === 1) {
    return toolCall('call_knowledge_1', 'search_knowledge', { query: '二次元 coser 账号定位 平台雷区', top_k: 3 })
  }

  if (toolResults.length === 2) {
    return toolCall('call_search_2', 'search_reference', { query: title.slice(0, 10), platform })
  }

  if (toolResults.length === 3) {
    return toolCall('call_gen_1', 'generate_script', {
      title,
      angle: '结合账号人设与热榜热度切入',
      platform,
      type: 'script',
      tags: ['热点', '选题'],
    })
  }

  if (toolResults.length === 4) {
    // 同一步可以并行调多个工具，这里演示一次调两个
    return {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_save_1',
          type: 'function',
          function: {
            name: 'save_to_library',
            arguments: JSON.stringify({
              title,
              angle: '结合账号人设与热榜热度切入',
              why: '热度高、话题有共鸣，适合账号定位',
              tags: ['热点', '选题'],
              platform,
              sourceTopic: title,
            }),
          },
        },
        {
          id: 'call_plan_1',
          type: 'function',
          function: {
            name: 'plan_schedule',
            arguments: JSON.stringify({ title, platform }),
          },
        },
      ],
    }
  }

  return {
    role: 'assistant',
    content:
      '已完成（mock 演示，未调用真实 DeepSeek）。整个流程是：\n' +
      `① fetch_hot_topics 抓取${platformName(platform)}实时热榜 → ② search_knowledge 检索运营知识库（账号定位/雷区/爆款打法） → ` +
      '③ search_reference 检索参考角度 → ④ generate_script 生成短视频脚本 → ⑤ 并行执行 save_to_library 保存选题 + plan_schedule 规划排期。\n' +
      '这就是 Agent「思考 → 调工具 → 观察结果 → 再思考 → 产出终答」的多步推理 + 多工具编排闭环。',
  }
}

// 构造一个单工具调用消息
function toolCall(id, name, args) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  }
}

// 从第一条 fetch 结果里取标题
function firstTopicTitle(toolResults) {
  let title = '今日热门话题'
  try {
    const items = JSON.parse(toolResults[0]?.content || '[]')
    const first = Array.isArray(items) ? items[0] : items?.items?.[0]
    if (first?.title) title = first.title
  } catch {
    // 解析失败就用默认标题
  }
  return title
}

function platformName(p) {
  return p === 'rednote' ? '小红书' : p === 'bili' ? 'B站' : '抖音'
}

// 从「用户消息」里猜平台（runAgent 会把 [平台: xxx] 写进用户消息）
// 注意只扫 user 消息：system prompt 里可能出现"小红书"等字样，会误判
function detectPlatform(messages) {
  const text = messages.filter((m) => m.role === 'user').map((m) => m.content || '').join(' ')
  if (/rednote|小红书/.test(text)) return 'rednote'
  if (/bili|b站|B站/.test(text)) return 'bili'
  if (/douyin|抖音/.test(text)) return 'douyin'
  return 'douyin'
}
