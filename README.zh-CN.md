# MindShelf

**别再囤标签了，把知识留下来。**

[English](./README.md)

---

你一定经历过：浏览器开着 300 个标签页，每一个都"不能关"。想整理，太多了；想关掉，怕丢东西。于是它们就那么挂着，吃着你的内存，也吃着你的心智。

MindShelf 终结这件事。它是一个 AI 驱动的 Chrome 扩展，把标签页里的混乱变成有序的知识——自动分类、摘要、去重，导出到你已经在用的笔记工具里。

```
焦虑（"我有300个标签"）
  → 扫描（"其中20个重复，其余分成15个类别"）
    → AI 处理（分类、摘要、去重、评估）
      → 导出到笔记（Apple Notes / Obsidian / Markdown）
        → 安心关掉标签
          → 随时在笔记中检索
```

## 功能

- **AI 分类** — 5 阶段流水线，15 个精细分类，SSE 流式进度
- **AI 摘要** — 一键生成页面摘要，支持多轮追问，Markdown 渲染
- **AI Agent** — 自然语言操作标签："关掉所有购物页面"、"把 React 相关的全部导出"
- **重复检测** — 四级匹配（完整 URL > 规范 URL > 标题精确 > 标题相似）
- **知识导出** — 保存到 **Apple Notes**（HTML 富文本）、**Obsidian**（Markdown + YAML frontmatter），或下载 `.md` 文件
- **内容提取** — Defuddle / Readability / 纯文本，按需切换
- **虚拟滚动** — 2000+ 标签丝滑浏览
- **多模型支持** — OpenAI、Anthropic、Ollama（及兼容 API）
- **深色模式** — 系统跟随 / 浅色 / 深色主题切换

## 快速开始

### 1. 启动后端

```bash
cd backend
cp .env.example .env    # 填入你的 AI API Key
npm install && npm run dev
```

### 2. 构建扩展

```bash
cd extension
npm install && npm run build
```

在 `chrome://extensions/` 打开开发者模式，加载 `extension/dist/chrome-mv3/` 目录。

开发模式（HMR）：`npm run dev`

### 3. 使用

打开侧边栏 → 自动扫描标签 → 点击 **分类** → AI 自动归类 → 点标签上的 **导出** → 保存到笔记 → 安心关掉标签。

### Docker 部署（可选）

```bash
docker pull ghcr.io/pdajoy/mindshelf/backend:main
docker run -d -p 3456:3456 -e AI_PROVIDER=openai -e OPENAI_API_KEY=sk-xxx ghcr.io/pdajoy/mindshelf/backend:main
```

## 配置

从 `.env.example` 创建 `backend/.env`：

```env
AI_PROVIDER=openai              # openai | anthropic | ollama
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini
OBSIDIAN_VAULT_PATH=/path/to/vault  # 文件直写，无需 Obsidian 运行
```

完整配置项（Anthropic、Ollama、Obsidian REST API 等）参见 [`.env.example`](backend/.env.example)。

## 架构

```
Chrome 扩展 (WXT + React 19 + TailwindCSS v4 + Zustand)
    ├── Side Panel — 标签列表、AI 聊天、笔记导出、设置
    ├── Content Script — 页面内容提取
    ├── Popup — 快速摘要与保存
    └── chrome.storage.local — 富化缓存（60天 TTL）
                │
                │ HTTP / SSE
                ▼
后端 (Express + TypeScript，纯内存)
    ├── AI — Vercel AI SDK 6，多 Provider 流式输出
    ├── 分类 — 5 阶段流水线（域名 → 规则 → 关键词 → AI → 整合）
    ├── 导出 — Markdown-first → Apple Notes HTML / Obsidian MD
    └── 桥接 — Apple Notes (osascript) · Obsidian (fs / REST API)
```

## API

后端提供 REST + SSE 接口：

| 端点 | 说明 |
|------|------|
| `POST /api/tabs/sync` | 从扩展同步标签 |
| `POST /api/ai/classify` | SSE 流式分类 |
| `POST /api/ai/summarize/:id` | SSE 流式摘要 |
| `POST /api/ai/chat` | 聊天 / Agent 工具调用 |
| `POST /api/export/single` | 导出到 Apple Notes / Obsidian |
| `GET /api/duplicates/detect` | 重复检测 |
| `GET /api/health` | 健康检查 |

## CI/CD

GitHub Actions 在每次推送到 `main` 时自动执行：
- **Chrome 扩展** — 构建并打包为可下载的 zip 产物
- **后端 Docker 镜像** — 多阶段构建（`tsc` → `node:22-alpine`），推送到 GHCR

打 `v*` 标签会自动创建 GitHub Release 并附带扩展 zip。

## 协议

[MIT](LICENSE)
