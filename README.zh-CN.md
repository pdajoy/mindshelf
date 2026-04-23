# MindShelf

**别再囤标签了，把知识留下来。**

[English](./README.md)

[Chrome 商店安装](https://chromewebstore.google.com/detail/foboooljjmhcbobgchlfmgbaipnbdmja)

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

- **AI 分类** — 5 阶段流水线，15 个精细分类，流式进度展示
- **AI 摘要** — 一键生成页面摘要，支持多轮追问，Markdown 渲染
- **AI Agent** — 自然语言操作标签："关掉所有购物页面"、"把 React 相关的全部导出"
- **重复检测** — 四级匹配（完整 URL > 规范 URL > 标题精确 > 标题相似）
- **知识导出** — 保存到 **Apple Notes**（HTML 富文本）、**Obsidian**（Markdown + YAML frontmatter），或下载 `.md` 文件
- **内容提取** — Defuddle / Readability / 纯文本，按需切换
- **划词工具栏** — 在任意网页选中文字后可直接问 AI 或保存，可在设置里关闭
- **虚拟滚动** — 2000+ 标签丝滑浏览
- **多模型支持** — OpenAI、Anthropic 及任何 OpenAI 兼容 API（Ollama、vLLM、Azure 等）
- **MCP 服务** — 外部 AI 代理（Cursor、Claude Desktop）可通过 MCP 管理你的标签
- **多语言** — 中英文界面，自动检测
- **深色模式** — 系统跟随 / 浅色 / 深色主题切换

## 快速开始

### 方式 A：从 Chrome 商店安装（推荐）

MindShelf 的 AI 完全在浏览器内运行。只有需要导出到 Apple Notes/Obsidian 或使用 MCP 时才需要后端。

1. 前往 [Chrome Web Store](https://chromewebstore.google.com/detail/foboooljjmhcbobgchlfmgbaipnbdmja) 安装
2. 打开侧边栏 → 在设置（齿轮图标）中配置 AI 服务商
3. 完成。开始扫描和分类吧。

### 方式 B：手动安装（zip / 本地构建）

1. 前往 [GitHub Releases](https://github.com/pdajoy/mindshelf/releases) 下载最新扩展 zip
2. 解压后在 `chrome://extensions/` 中加载（打开开发者模式 → 加载已解压的扩展）
3. 打开侧边栏 → 在设置（齿轮图标）中配置 AI 服务商

### 方式 C：带后端（用于导出和 MCP）

```bash
# 启动 MindShelf 服务（一条命令）
npx mindshelf serve

# 或指定 Obsidian vault：
npx mindshelf serve --obsidian-vault /path/to/your/vault

# 扩展
cd extension
npm install && npm run build
# 在 chrome://extensions/ 加载 extension/dist/chrome-mv3/
```

或用 Docker 启动后端：

```bash
docker run -d -p 3456:3456 \
  -v /path/to/obsidian/vault:/vault \
  -e OBSIDIAN_VAULT_PATH=/vault \
  ghcr.io/pdajoy/mindshelf/backend:latest
```

开发模式：

```bash
cd backend && npm install && npm run dev   # 文件变更自动重启
cd extension && npm run dev                # HMR
```

### 使用

打开侧边栏 → 自动扫描标签 → 点击 **分类** → AI 自动归类 → 点标签上的 **保存** → 导出到笔记 → 安心关掉标签。

## 架构

```
Chrome 扩展 (WXT + React 19 + TailwindCSS v4 + Zustand)
    ├── Side Panel — 标签列表、AI 聊天、笔记导出、设置面板
    ├── Content Script — Defuddle / Readability 页面提取
    ├── Background — WebSocket 桥接客户端、标签生命周期
    ├── Popup — 快速摘要与保存
    ├── AI 引擎 — Vercel AI SDK（浏览器内运行，直连 API）
    │   ├── 分类 — 5 阶段流水线
    │   ├── 聊天 / Agent — 流式输出 + 工具调用（7 个工具）
    │   └── 笔记优化
    ├── i18n — i18next（中/英）
    └── chrome.storage.local — 富化缓存（60天 TTL）
                │
                │ HTTP（仅导出）
                │ WebSocket（MCP 桥接）
                ▼
后端 — npx mindshelf（单进程，无 Express）
    ├── HTTP 服务 — 原生 Node.js http（导出 API）
    ├── WebSocket 桥接 — 转发 MCP 命令到扩展
    ├── 导出 — Apple Notes (osascript/JXA) · Obsidian（文件直写）
    └── MCP 服务 — 9 个工具，基于 @modelcontextprotocol/sdk（stdio transport）
```

**核心设计决策**：AI 运行在扩展端，不在后端。这意味着：
- 服务器不存储 API Key — 用户直接在扩展中配置服务商
- 核心功能不需要后端（扫描、分类、摘要、聊天）
- 后端是可选的 — 仅用于导出到 Apple Notes/Obsidian 和 MCP 集成

## 配置

### AI 服务商（在扩展设置中）

点击齿轮图标 → **AI 服务商**：
- 支持添加多个服务商（OpenAI、Anthropic 或任何 OpenAI 兼容 API）
- 每个服务商可配置多个模型
- 独立设置 API Key、Base URL 和模型列表
- 激活一个服务商并选择默认模型

### 界面与交互（在扩展设置中）

- 界面语言 — 自动检测 / 中文 / English
- 划词工具栏 — 控制网页选中文本后是否显示“问 AI / 保存”快捷操作

### 后端（可选）

```bash
npx mindshelf serve                              # 默认端口 3456
npx mindshelf serve --port 4000                  # 自定义端口
npx mindshelf serve --obsidian-vault ~/MyVault   # 指定 Obsidian vault
```

或从 `.env.example` 创建 `backend/.env`：

```env
PORT=3456

# Obsidian 导出（文件直写到 vault 目录）
# OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
```

### MCP 集成

MindShelf 通过 MCP 暴露 9 个工具供外部 AI 代理使用。

**Cursor / Claude Desktop**（stdio 模式）：
```json
{
  "mcpServers": {
    "mindshelf": {
      "command": "npx",
      "args": ["mindshelf"]
    }
  }
}
```

stdio 进程会自动检测 MindShelf 服务是否运行，如未运行会在后台自动启动。多个 AI 客户端可同时连接——每个客户端生成一个轻量 stdio 进程，共享同一个服务实例。

前提条件：Chrome 扩展侧边栏已打开（以建立 WebSocket 桥接）。

### macOS 权限（MCP / 导出相关）

- **Chrome 本地网络权限** — MindShelf 通过 `ws://localhost:3456` 让扩展连接本地后端。较新的 Chrome 版本可能会为扩展弹出 **Local Network** 权限，请选择允许；如果之前拒绝过，请到扩展在 Chrome 中的站点权限详情里把 **Local Network** 改为 **Allow**。
- **Automation / Apple Events** — 导出到 Apple Notes 时，MindShelf 会通过 `osascript` 控制 Notes.app。首次导出时，macOS 可能会向启动 `npx mindshelf` 的应用（Terminal、iTerm、Cursor、Claude Desktop 等）请求自动化权限，请在 **系统设置 → 隐私与安全性 → 自动化** 中允许。
- **Obsidian 导出** — 除了提供一个可写的 vault 路径外，一般不需要额外的 macOS 权限弹窗。

| MCP 工具 | 说明 |
|----------|------|
| `list_tabs` | 列出所有浏览器标签（支持筛选） |
| `search_tabs` | 按关键词搜索标签 |
| `get_tab_detail` | 获取标签详细信息 |
| `close_tabs` | 按 ID 关闭标签 |
| `categorize_tabs` | 触发 AI 分类 |
| `detect_duplicates` | 检测重复标签 |
| `get_page_content` | 提取当前页面内容 |
| `export_to_notes` | 导出到 Apple Notes |
| `export_to_obsidian` | 导出到 Obsidian |

## API

后端暴露精简的 API：

| 端点 | 说明 |
|------|------|
| `GET /api/health` | 健康检查（含桥接连接状态） |
| `POST /api/export/single` | 导出到 Apple Notes / Obsidian |
| `GET /api/export/targets` | 检查可用导出目标 |
| `GET /api/export/folders/apple-notes` | 列出 Apple Notes 文件夹 |
| `GET /api/export/folders/obsidian` | 列出 Obsidian vault 文件夹 |
| `ws://…/ws/bridge` | MCP ↔ 扩展 WebSocket 桥接 |

## CI/CD

GitHub Actions 在每次推送到 `main` 时自动执行：
- **Chrome 扩展** — 构建并打包为可下载的 zip 产物
- **后端 Docker 镜像** — 多阶段构建（`tsc` → `node:22-alpine`），推送到 GHCR

打 `v*` 标签会自动创建 GitHub Release 并附带扩展 zip。

## 协议

[MIT](LICENSE)
