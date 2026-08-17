# AI 热点选题助手 · 部署上手指南

> 目标：把项目部署到 Vercel，得到一个线上链接。
> 方式：GitHub + Vercel（推代码到 GitHub，Vercel 自动构建部署）。
> 更新时间：2026-08-17

---

## 部署思路（先看懂再动手）

```
你的电脑 (D:\Study\ai)
    │  git push
    ▼
GitHub 仓库（代码托管，简历佐证）
    │  Vercel 检测到推送，自动拉代码+构建
    ▼
Vercel（云端运行，生成 https://xxx.vercel.app 链接）
```

关键点：**代码在 GitHub，密钥在 Vercel 后台**（不写进代码）。

---

## 第 0 步：部署前准备（必做）

### 0.1 修复 ai.js 的 Authorization bug（重要）

文件：`server/lib/ai.js` 第 9 行

```js
// 把这行（错误）：
Authorization: *** ${apiKey}`,
// 改成：
Authorization: Bearer ${apiKey}`,
```

> 原因：本地实测能用是因为 DeepSeek 服务端宽容；线上换环境可能直接 401，必须修。

### 0.2 确认密钥安全

- `.gitignore` 已包含 `.env` 和 `data/`（代码里已有 ✅）
- `git init` 之后，`.env` 就不会被提交
- 提交前可以用 `git status` 检查，确保没有 `.env` 在列表里

---

## 第 1 步：创建 GitHub 仓库

1. 打开 https://github.com → 登录
2. 右上角 **+** → **New repository**
3. 仓库名：`ai-hot-topic-assistant`（或你喜欢的名字）
4. 选 **Public**（公开，简历可见）
5. 不要勾选 README/.gitignore（本地已有）
6. 点 **Create repository**

创建后页面会显示推送命令，先别关。

---

## 第 2 步：本地初始化 git 并推送

打开终端（在 D:\Study\ai 目录），执行：

```bash
cd /d/Study/ai

# 1. 初始化 git
git init

# 2. 检查即将提交的文件（确认没有 .env！）
git add .
git status
# 看到列表里没有 .env、没有 data/ 就安全

# 3. 提交
git commit -m "init: AI 热点选题助手"

# 4. 关联远程仓库（换成你自己的用户名）
git branch -M main
git remote add origin https://github.com/你的用户名/ai-hot-topic-assistant.git

# 5. 推送
git push -u origin main
```

> ⚠️ 如果 `git status` 里出现 `.env`，先删掉再提交：`git rm --cached .env`
> ⚠️ 如果 push 要登录，用 GitHub 网页提示的浏览器登录方式即可。

---

## 第 3 步：Vercel 导入项目

1. 打开 https://vercel.com → 用 **GitHub 账号登录**（Sign up with GitHub）
2. 点 **Add New Project** → **Import** 你刚推的仓库
3. 框架会自动识别为 **Vite**（vercel.json 里已配好 build 命令和输出目录，不用改）
4. 点 **Deploy**，等 1-2 分钟

部署完成会得到一个链接：`https://ai-hot-topic-assistant.vercel.app`

---

## 第 4 步：配置环境变量（密钥放这里）

Vercel 项目 → **Settings** → **Environment Variables**，添加：

| 变量名 | 值 | 必填 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 你的 DeepSeek key（sk- 开头） | ✅ 必填 |
| `BLOB_READ_WRITE_TOKEN` | 见下方「开启 Blob 存储」 | ✅ 必填 |
| `HOTLIST_BASE_URL` | `https://60s.viki.moe` | 可选（有默认值） |
| `HOTLIST_MIRROR_URL` | 60s 国内镜像地址（如有） | 可选 |

加完后点 **Deployments** → 找到最新部署 → 三个点菜单 → **Redeploy**（让新变量生效）。

### 开启 Vercel Blob 存储（数据持久化用）

1. Vercel 项目页 → **Storage** → **Create Database** → 选 **Blob**
2. 创建后，复制 `BLOB_READ_WRITE_TOKEN`
3. 加到环境变量里，再 Redeploy

> 没有 Blob token 时，线上数据存不住（刷新就丢），这是项目里 store.js 的设计：本地用 fs，线上用 Blob。

---

## 第 5 步：验证上线效果

打开你的 `https://xxx.vercel.app` 链接，逐项检查：

- [ ] 热榜页能刷出抖音 / 小红书 / B站
- [ ] 生成选题能用（说明 DeepSeek key 生效）
- [ ] 选题库保存一条 → 刷新页面 → 数据还在（说明 Blob 生效）
- [ ] 复盘页加一条记录 → 刷新还在

全部 ✅ 就部署成功了！

---

## 常见问题（排错）

| 问题 | 原因 | 解决 |
|---|---|---|
| 页面能开但热榜空 | 60s 接口限流/超时 | 项目有缓存回退，等接口恢复或配 MIRROR_URL |
| 选题报「not configured」 | DEEPSEEK_API_KEY 没配上 | 检查环境变量 + Redeploy |
| 刷新后数据丢 | BLOB_READ_WRITE_TOKEN 没配 | 开启 Blob 存储，把 token 配到环境变量 |
| 链接打不开/很慢 | vercel.app 在国内偶尔被墙/慢 | 多刷新；后期可绑自定义域名 |
| 首次打开要等几秒 | serverless 冷启动，正常 | 多打开几次就热了 |

---

## 部署后的简历描述

> **AI 热点选题助手**（Vue 3 + Node.js + DeepSeek API + Vercel）
> 独立开发并**部署上线**的热点选题工具：自动抓取抖音/小红书/B站热榜，结合账号定位用 AI 生成选题建议，支持选题库、趋势追踪、数据复盘。线上地址：https://xxx.vercel.app ｜ 代码：github.com/你的用户名/ai-hot-topic-assistant
