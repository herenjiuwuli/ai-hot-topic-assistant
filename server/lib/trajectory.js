// 过程断言：对 Agent 的「工具调用链」做断言，而不只是断言最终答案。
//
// 为什么需要这个东西：
// 常规测试只问「答案对不对」。但 Agent 的典型故障全是过程性的 ——
//   ① 该调工具却直接凭记忆回答（答案看起来还挺像）
//   ② 调错了工具（问热榜却去查知识库，答案也能编得像样）
//   ③ 参数越界（topK 传 999 → 检索变慢甚至拖垮；平台名传了个不存在的 → 脏数据入库）
// 这三种，终态断言一条都抓不到：答案可能完全正确。
//
// 所以这里把「什么样的调用链算合理」写成可执行的规则，对 trajectory 求值。
// trajectory 的形状由 runAgent 产出（每步 {type:'tool'|'answer', name, args, result}）。
//
// spec 支持的字段：
//   mustCall:     ['fetch_hot_topics']          必须调用过的工具
//   mustNotCall:  ['save_to_library']           不该调用的工具（比如只是问问，没让保存）
//   order:        ['fetch_hot_topics','generate_script']  必须按这个先后出现（子序列，中间可有别的）
//   minCalls / maxCalls: 4                      调用次数上下限
//   argRules:     { search_knowledge: (args, step) => null | '错误描述' }
//   requireAnswer: true                         最后必须有终答（被 MAX_ITER 截断时为 false）
//
// 返回 problems（字符串数组）：空数组 = 这条链子符合预期。

const KNOWN_TOOLS = [
  'fetch_hot_topics',
  'search_reference',
  'search_knowledge',
  'generate_script',
  'save_to_library',
  'plan_schedule',
]

export function checkTrajectory(trajectory = [], spec = {}) {
  const problems = []
  const steps = Array.isArray(trajectory) ? trajectory : []
  const calls = steps.filter((s) => s && s.type === 'tool')
  const names = calls.map((c) => c.name)
  const answers = steps.filter((s) => s && s.type === 'answer')

  // ① 必须调用
  for (const name of spec.mustCall || []) {
    if (!names.includes(name)) {
      problems.push(`该调 ${name} 却没调（实际调用：${names.length ? names.join(' → ') : '一次都没有'}）`)
    }
  }

  // ② 不该调用
  for (const name of spec.mustNotCall || []) {
    if (names.includes(name)) {
      problems.push(`不该调 ${name} 却调了（第 ${names.indexOf(name) + 1} 次调用）`)
    }
  }

  // ③ 顺序：必须是子序列，中间允许夹别的工具
  if (spec.order && spec.order.length) {
    let cursor = 0
    for (const name of names) {
      if (cursor < spec.order.length && name === spec.order[cursor]) cursor++
    }
    if (cursor < spec.order.length) {
      problems.push(
        `调用顺序不对：期望出现 ${spec.order.join(' → ')}，实际只对上前 ${cursor} 个（${names.join(' → ') || '无调用'}）`
      )
    }
  }

  // ④ 次数
  if (spec.minCalls !== undefined && names.length < spec.minCalls) {
    problems.push(`工具调用次数过少：期望 ≥ ${spec.minCalls}，实际 ${names.length}`)
  }
  if (spec.maxCalls !== undefined && names.length > spec.maxCalls) {
    problems.push(`工具调用次数过多：期望 ≤ ${spec.maxCalls}，实际 ${names.length}（可能是死循环前兆）`)
  }

  // ⑤ 参数规则：把「参数该在什么范围」写成检查函数，一条一个
  for (const [tool, rule] of Object.entries(spec.argRules || {})) {
    calls.forEach((c, idx) => {
      if (c.name !== tool) return
      let err = null
      try {
        err = rule(c.args || {}, c)
      } catch (e) {
        err = `参数校验函数自己抛错：${e.message}`
      }
      if (err) problems.push(`${tool}（第 ${idx + 1} 次调用）参数不合规：${err}`)
    })
  }

  // ⑥ 未知工具：模型可能凭空编一个工具名，执行器那时会报「工具不存在」，
  // 但更早在这里就该发现——它说明模型对可用能力产生了错觉。
  for (const name of names) {
    if (!KNOWN_TOOLS.includes(name)) problems.push(`调用了不存在的工具「${name}」（模型编的工具名）`)
  }

  // ⑦ 终答
  if (spec.requireAnswer !== false) {
    if (!answers.length) problems.push('没有终答（被 MAX_ITER 截断，或模型只调工具不说话）')
    else if (!String(answers[answers.length - 1].content || '').trim()) problems.push('终答为空')
  }

  return problems
}

/** 只要一条链子有问题就抛错，便于在测试里 expect(() => assertTrajectory(...)).not.toThrow() 的写法 */
export function assertTrajectory(trajectory, spec) {
  const problems = checkTrajectory(trajectory, spec)
  if (problems.length) throw new Error('工具调用链不符合预期：\n - ' + problems.join('\n - '))
  return true
}

/** 把 trajectory 压成一行人读的摘要，失败时贴进报错里比 JSON 有用 */
export function summarizeTrajectory(trajectory = []) {
  return trajectory
    .map((s) => {
      if (s.type === 'tool') {
        const argText = Object.keys(s.args || {}).length ? JSON.stringify(s.args).slice(0, 60) : ''
        return `${s.name}${argText ? `(${argText})` : '()'}`
      }
      if (s.type === 'answer') return `answer(${String(s.content || '').slice(0, 30)}…)`
      return s.type
    })
    .join(' → ')
}
