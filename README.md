# AI 热点选题助手

基于 Vite + Vue 3 + Express + Vercel Serverless 的全栈工具，帮助 MCN 达人运营从热榜中快速发现选题、生成内容、追踪趋势、复盘数据。

## 功能

- **热榜** — 抖音 / 小红书 / B站 实时热榜，关键词搜索，热点订阅提醒
- **选题** — 输入账号定位，AI 结合热榜生成 5 个选题（DeepSeek）
- **选题库** — 保存选题 → 标记已发布 → 去复盘，三态闭环
- **脚本/文案** — 选中选题一键生成短视频脚本或小红书图文文案
- **趋势** — 近 7 天热词热度走势图，快照手动保存
- **复盘** — 播放量/点赞量数据记录，柱状图对比，批量导入 CSV

## 技术栈

- **前端**: Vue 3 (Composition API) + Vue Router (hash 模式) + Chart.js
- **后端**: Express (serverless), @vercel/blob (存储)
- **AI**: DeepSeek Chat Completions API
- **数据源**: 60s API (https://60s.viki.moe)、B站官方 API
- **部署**: Vercel (静态 + api/ serverless 函数)

## 本地运行

```bash
# 安装依赖
npm install

# 启动开发环境（同时起 Vite 前端 + Express 后端）
npm run dev
```

前端 http://localhost:5173，后端 http://localhost:3000。

## 环境变量

参考 `.env.example` 配置：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（必填，仅在 Vercel 环境变量中设置） | - |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 读写 Token（线上用，本地自动回退 fs） | - |
| `HOTLIST_BASE_URL` | 60s 热榜接口基础 URL | `https://60s.viki.moe` |
| `HOTLIST_MIRROR_URL` | 60s 镜像 URL（主域名失败时回退） | 空 |

## 部署

1. 在 [Vercel](https://vercel.com) 导入本项目
2. Vercel 自动检测 `api/` 目录（serverless 函数）和 `dist/` 输出（静态文件）
3. 在 Vercel 项目 Settings → Environment Variables 中配置上述环境变量
4. 部署完成后无 Rewrite 配置需求（前端已用 hash 路由）

注意：`vercel.json` 中 `maxDuration` 设为 60 秒，避免 DeepSeek 调用超时。

## 趋势图说明

趋势数据依赖每天的快照累积。首次部署后只有当天数据，需要持续运行多天，趋势图才会呈现完整走势。可通过「保存今日快照」按钮手动保存当天快照。