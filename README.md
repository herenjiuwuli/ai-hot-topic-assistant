# AI 热点选题助手

> 面向 MCN 达人运营的 AI 选题工具：自动抓取抖音 / 小红书 / B站 热榜，结合账号定位用 AI 生成可落地选题，并支持选题库、趋势追踪与数据复盘。

基于 **Vue 3 + Vite + Express（Serverless）+ DeepSeek** 的全栈应用，一键部署到 Vercel。

---

## ✨ 功能特性

- **实时热榜** — 抖音 / 小红书 / B站 当日热榜，支持关键词搜索与热点订阅
- **AI 选题** — 输入账号定位，AI 结合当日热榜生成 5 个不同切入角度的选题（DeepSeek）
- **选题库** — 保存选题 → 标记已发布 → 去复盘，三态闭环管理
- **脚本 / 文案** — 选中选题一键生成短视频分镜脚本，或小红书风格图文文案
- **趋势追踪** — 近 7 天热词热度走势图（依赖每日快照累积）
- **数据复盘** — 播放量 / 点赞量记录，柱状图对比，支持批量导入

---

## 🛠 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3（Composition API）+ Vue Router（hash 模式）+ Chart.js |
| 后端 | Express（Vercel Serverless Function） |
| AI | DeepSeek Chat Completions API |
| 数据源 | 60s 热榜 API（`https://60s.viki.moe`）、B站官方排行榜 API |
| 存储 | Vercel Blob（线上）/ 本地 fs（本地兜底） |
| 部署 | Vercel（静态前端 `dist/` + `api/` Serverless 函数） |

---

## 📁 项目结构

```
ai-hot-topic-assistant/
├── api/
│   └── index.js            # Vercel Serverless 入口，挂载 Express 应用
├── server/                 # Express 后端
│   ├── index.js            # createApp()：注册路由 + /api/health
│   ├── dev.js              # 本地开发启动（监听 :3000）
│   ├── lib/
│   │   ├── ai.js           # DeepSeek 调用
│   │   ├── hotlistSource.js # 60s + B站 热榜抓取与归一化
│   │   ├── normalize.js
│   │   └── store.js        # Blob / fs 持久化封装
│   └── routes/             # 业务路由（hotlist / topics / savedTopics / ...）
├── src/                    # Vue 3 前端
│   ├── views/              # 页面：Hotlist / Topics / SavedTopics / Trend / Review ...
│   ├── components/
│   ├── router/
│   └── ...
├── public/
├── vercel.json             # 构建配置 + rewrites（关键）
├── vite.config.js
├── package.json
└── .env.example
```

---

## 🚀 本地运行

```bash
# 安装依赖
npm install

# 启动开发环境（同时起 Vite 前端 + Express 后端）
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3000（Vite 已配置 `/api` 代理到该端口）

> 本地可不配置 `BLOB_READ_WRITE_TOKEN`，数据自动回退到本地 `data/` 目录。

---

## 🔐 环境变量

复制 `.env.example` 为 `.env` 进行本地开发；**线上变量请在 Vercel 后台配置**（不要写进代码）。

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（`sk-` 开头，必填，仅线上配置） | - |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 读写 Token（线上持久化用，本地可省略） | - |
| `HOTLIST_BASE_URL` | 60s 热榜接口基础 URL | `https://60s.viki.moe` |
| `HOTLIST_MIRROR_URL` | 60s 镜像 URL（主域名失败时回退） | 空 |

---

## 📡 API 接口

所有接口以 `/api` 为前缀；平台参数 `platform` 取值为 `douyin` / `rednote` / `bili`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/hotlist?platform=` | 获取实时热榜（在线失败自动回退本地快照） |
| GET | `/api/bili-zone?rid=0` | B站分区排行榜 |
| POST | `/api/topics` | 根据账号定位 + 热榜生成 5 个选题 |
| GET | `/api/saved-topics` | 选题库列表 |
| POST | `/api/saved-topics` | 新增选题 |
| PUT | `/api/saved-topics/:id` | 更新选题（含发布状态） |
| DELETE | `/api/saved-topics/:id` | 删除选题 |
| POST | `/api/script` | 生成脚本 / 文案（`type`: `script` \| `copy`） |
| GET | `/api/snapshots` | 快照列表 |
| POST | `/api/snapshots` | 手动保存当日快照 |
| GET | `/api/trend?platform=&keyword=` | 近 7 天热词热度走势 |
| GET | `/api/reviews` | 复盘列表 |
| POST | `/api/reviews` | 新增复盘 |
| PUT | `/api/reviews/:id` | 更新复盘 |
| DELETE | `/api/reviews/:id` | 删除复盘 |
| POST | `/api/reviews/bulk` | 批量导入复盘 |
| GET | `/api/subscriptions` | 订阅列表 |
| POST | `/api/subscriptions` | 新增订阅 |
| DELETE | `/api/subscriptions/:id` | 删除订阅 |

---

## ☁️ 部署到 Vercel

项目已内置 `vercel.json`，导入即部署，无需手动设置 Framework：

1. 将代码推送到 GitHub
2. 在 [Vercel](https://vercel.com) 点击 **Add New → Project**，导入本仓库
3. Vercel 自动识别为 Vite 项目：`buildCommand` = `npm run build`，`outputDirectory` = `dist`
4. 在 **Settings → Environment Variables** 配置上表中的环境变量
5. 点击 Deploy；部署完成后在 **Deployments** 中 Redeploy 一次，让环境变量生效

> ⚠️ **`vercel.json` 中的 `rewrites` 是必须的**：它把 `/api/*` 全部转发到 `api/index.js` 这个 Serverless 函数（Express 应用）。
> 若缺少这条规则，线上所有 `/api/*` 接口都会返回 404 —— 因为 Vercel 默认只把 `api/index.js` 映射到 `/api` 单一路由，不会去匹配 `/api/health` 等子路径。
>
> `vercel.json` 中 `maxDuration` 设为 60 秒，用于避免 DeepSeek 调用偶发超时。

---

## 📊 趋势图与数据持久化

- **趋势图**依赖每日快照累积：首次部署后只有当天数据，持续运行数天后走势才会完整；也可在页面点「保存今日快照」手动补录。
- **持久化**：配置了 `BLOB_READ_WRITE_TOKEN` 后，数据写入 Vercel Blob，跨刷新保留；未配置时回退本地临时存储，刷新即丢。

---

## 📄 License

MIT
