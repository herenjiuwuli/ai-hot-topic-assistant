import 'dotenv/config'
import { createApp } from './index.js'

const PORT = process.env.PORT || 3000

const app = createApp()

const server = app.listen(PORT, () => {
  console.log(`[be] Dev server running at http://localhost:${PORT} (pid ${process.pid})`)
})

// 端口被占用 / 其他监听错误：明确报错再退出，避免静默失效
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[be] 端口 ${PORT} 已被占用（EADDRINUSE）。先杀掉占用进程再启动，或用 npm run dev:clean 一键清理。`)
  } else {
    console.error(`[be] 监听失败：`, err)
  }
  process.exit(1)
})

// 记录收到的信号，方便排查「无故退出 code 0」类问题
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    console.log(`[be] 收到信号 ${sig}，优雅关闭`)
    server.close(() => process.exit(0))
  })
}
