// dev:clean —— 一键启动整套开发栈（前端 5182 + 后端 3000），并自动保活
//
// 解决三个痛点：
//   1) 上次会话的残留进程蹲在 3000/5182 上答旧路由 → Vite 代理 /api 全 404
//   2) 某些环境下后端进程会无故退出（exited with code 0）→ 启动后 watch 后端，异常退出自动拉起
//   3) 清端口存在时序竞态（netstat 那一刻没抓到孤儿）→ 改成「清 + 轮询确认空闲」；
//      若前端仍漂到非 5182，自动纠正回 5182
//
// 用法：npm run dev:clean   （单条命令，前后端一起起，不用开两个终端）

import { spawn, execSync } from 'node:child_process'
import { createInterface } from 'node:readline'

const PORTS = [3000, 5182]
const FE_PORT = 5182
let stopping = false

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function findPidsOnPort(port) {
  const pids = new Set()
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p TCP', { encoding: 'utf8' })
      const re = new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)
      for (const line of out.split('\n')) {
        const m = line.match(re)
        if (m) pids.add(m[1])
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' })
      out.split('\n').map((s) => s.trim()).filter(Boolean).forEach((p) => pids.add(p))
    }
  } catch {
    // 端口为空时命令会非零退出，忽略即可
  }
  return [...pids]
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
    } else {
      process.kill(Number(pid), 'SIGKILL')
    }
    console.log(`[dev:clean] 已杀掉残留进程 PID ${pid}`)
  } catch {
    // 已经退出
  }
}

// 清掉指定端口上的所有监听进程
function clearPort(port) {
  const pids = findPidsOnPort(port)
  if (pids.length) {
    console.log(`[dev:clean] 端口 ${port} 有 ${pids.length} 个残留进程，清理中...`)
    pids.forEach(killPid)
    return true
  }
  return false
}

function clearAllPorts() {
  let any = false
  for (const port of PORTS) any = clearPort(port) || any
  return any
}

// 反复清端口并轮询，直到都空闲（解决 netstat 时序竞态 / TIME_WAIT）
async function freePorts(maxRounds = 6) {
  for (let i = 0; i < maxRounds; i++) {
    clearAllPorts()
    await sleep(400)
    const occupied = PORTS.filter((p) => findPidsOnPort(p).length > 0)
    if (occupied.length === 0) return true
    console.log(`[dev:clean] 端口 ${occupied.join(',')} 仍被占用，重试清理 (${i + 1}/${maxRounds})...`)
  }
  return false
}

// 带 [fe]/[be] 行前缀地派生子进程（stdin 设为 ignore，避免子进程因 stdin 关闭而退出）
function spawnLabeled(label, cmd, args) {
  const child = spawn(cmd, args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue
    const rl = createInterface({ input: stream })
    const tag = `[${label}] `
    rl.on('line', (line) => console.log(tag + line))
  }
  return child
}

// 从 vite 输出里抽取实际监听端口，例如 "Local:   http://localhost:5183/"
function extractVitePort(text) {
  const m = text.match(/localhost:(\d+)\//)
  return m ? Number(m[1]) : null
}

async function main() {
  console.log('[dev:clean] 清理开发端口残留进程...')
  await freePorts()

  console.log('[dev:clean] 启动前端 (vite) 与后端 (express :3000)...')

  // 前端：若漂到非 5182，纠正回 5182
  let feRestarts = 0
  function startFe() {
    if (stopping) return
    const fe = spawnLabeled('fe', 'npm', ['run', 'dev:fe'])
    let actualPort = null
    fe.stdout.on('data', (buf) => {
      const port = extractVitePort(buf.toString())
      if (port) actualPort = port
    })
    fe.on('exit', (code, signal) => {
      if (stopping) return
      // 漂移纠正：仍占用 5182 时，清掉占用者再起（最多纠正 2 次）
      if (actualPort && actualPort !== FE_PORT && feRestarts < 2) {
        feRestarts++
        console.log(`[dev:clean] ⚠️ 前端漂到了 :${actualPort}（期望 :${FE_PORT}），清理 ${FE_PORT} 后重新绑定...`)
        clearPort(FE_PORT)
        setTimeout(startFe, 600)
      } else {
        console.log(`[dev:clean] 前端退出 (code=${code}, signal=${signal})`)
      }
    })
    return fe
  }
  startFe()

  // 后端 + watchdog：异常退出就自动重启（每次重启前先清一次端口，防僵尸重新占坑）
  let beRestarts = 0
  function startBe() {
    if (stopping) return
    const be = spawnLabeled('be', 'npm', ['run', 'dev:be'])
    be.on('exit', (code, signal) => {
      if (stopping) return
      beRestarts++
      console.log(
        `[dev:clean] ⚠️ 后端异常退出 (code=${code}, signal=${signal})，第 ${beRestarts} 次尝试自动重启...`
      )
      clearAllPorts()
      const delay = Math.min(1000 * 2 ** Math.min(beRestarts, 4), 8000)
      setTimeout(startBe, delay)
    })
    return be
  }
  startBe()

  const shutdown = () => {
    if (stopping) return
    stopping = true
    console.log('\n[dev:clean] 收到退出信号，正在关闭前后端...')
    // 直接按端口清掉子进程（npm 包装层在 Windows 上转发信号不可靠，按端口杀最稳）
    clearAllPorts()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
