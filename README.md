# Chrome Tab Helper

智能浏览器标签管理工具——将混乱的标签页转化为有序的信息资产。

## 功能

### 核心功能
- **多维资产模型**：标签不再只有一个分类，而是拥有正交的多维属性：
  - **L1 主题层 (topic_id)**：互斥的内容分类（tech/research/news/...）
  - **L2 状态层 (facets[])**：可叠加的状态标签（重复/过时/冻结/稍后读/高价值）
  - **L3 价值层**：AI 推荐动作 (keep/close/bookmark/snooze) + 时效评分 (freshness_score)
  - **L4 决策层**：用户最终决定 (user_decision) + 决策时间
- **Facet 筛选**：筛选栏 Facet Chips 支持多选组合筛选（如"tech + 过时"）
- **多级智能分类**：5 阶段渐进式分类流水线（域名聚合→规则识别→标题分析→AI 深度分析→整合修正），全程可视化进度
- **AI 推荐**：分类时同步生成 AI 建议动作（keep/close/bookmark/snooze）和内容时效评分
- **流式总结**：单标签 AI 摘要流式输出（简洁 / 详细可选） + 追问对话（流式） + 分类级别批量总结，现代聊天窗口 UI，完整 Markdown 渲染（标题/列表/引用/代码）
- **模型选择**：运行时切换 AI 模型（OpenAI / Claude / Ollama），支持兼容 API（NVIDIA NIM 等）
- **过期清理**：标签年龄可视化（绿→黄→红），过时内容检测，自动标记 facet
- **重复检测**：URL 规范化精确去重（保留有效 query，过滤追踪参数）+ 标题路径相似度检测，重复集群持久化
- **分类过程日志**：分类时提供终端风格日志，展示每阶段发现与处理细节（域名、规则命中、AI批次、置信度、画像倾向、Facet 统计）
- **多格式导出**：JSON / Markdown / Apple Notes 笔记卡片

### 标签管理
- **稍后阅读**：快捷时间选择（1分钟/30分钟/3小时/今晚/明天/下周/自定义），到期推送通知
- **收藏夹管理**：收藏时可选择目标文件夹，支持新建文件夹，收藏夹浏览/管理面板
- **Session 快照**：保存当前所有标签为会话，支持按需勾选恢复
- **页面快照**：保存网页内容为本地 HTML（图片内嵌，支持懒加载/相对URL解析）/文本/截图，防止页面失效丢失
- **标签预算**：设定上限，超出自动预警
- **批量操作**：多选标签（含按分类全选）批量关闭/收藏/稍后读/总结
- **跨窗口激活**：点击标签时自动切换到对应窗口并激活，支持被冻结的标签
- **渐进式引导清理**：Facet 驱动的多阶段从易到难（重复→过时→相似→冻结→稍后读→按分类），分类阶段支持可折叠 AI 建议、AI 快捷选择、行内快捷动作，决策可 toggle 取消。产品级卡片式 UI（Hero 阶段头部、渐变进度条、胶囊决策按钮、导航角标实时计数、📋 决策汇总页支持 review + 修改 + 确认执行）

### 深度分析
- **人物画像**：基于标签数据自动分析用户技术兴趣、学习风格、性格特征
- **主题聚类**：18 个维度的主题自动聚类（LLM、IoT、安全、前端、Go...）
- **平台来源**：识别 15 个主要信息平台的分布（GitHub、微信、B站...）
- **关键词热度**：中英文双语关键词提取和频次排名
- **量化清理建议**：自动识别死链、登录页、重复页并给出清理优先级

### 开发者功能
- **API 调用日志**：查看所有 AI/LLM 调用记录（provider、模型、token 数、耗时、状态）
- **REST API**：完整的标签 CRUD + AI 处理 + 深度分析接口
- **MCP Server**：12 个工具，集成 Cursor / Claude Desktop 等 AI 工具

## 架构

```
Chrome Extension (Manifest V3)          Node.js Backend
┌─────────────────────────┐    HTTP    ┌──────────────────┐
│ Side Panel (主界面)      │◄─────────►│ Express REST API │
│  ├─ 渐进式引导清理       │    SSE    │ AI Provider 层    │
│  ├─ 收藏夹管理          │◄─────────►│  ├─ OpenAI       │
│  └─ API 日志查看        │           │  ├─ Claude       │
│ Popup (快速概览+总结)    │           │  └─ Ollama       │
│ Background Worker       │           │ JSON 存储         │
│  ├─ 标签/收藏夹管理     │           │ 分析引擎          │
│  ├─ Snooze 闹钟         │           │ 快照存储          │
│  ├─ 跨窗口标签激活      │           │ API 调用日志      │
│  └─ 通知推送            │           │ 会话追问管理      │
│ Content Script (Readability)│         │ MCP Server       │
└─────────────────────────┘           └──────────────────┘
```

## 数据模型

每个标签拥有 4 个正交维度：

| 维度 | 字段 | 回答的问题 | 特性 |
|------|------|-----------|------|
| 主题层 | `topic_id`, `topic_confidence`, `topic_source` | 它是什么内容？ | 互斥分类 |
| 状态层 | `facets[]`, `stale_days`, `is_frozen`, `freshness_score` | 它有什么状态/问题？ | 可叠加标签 |
| 价值层 | `priority_score`, `ai_recommendation`, `profile_match` | 值不值得保留？ | AI 评分 |
| 决策层 | `user_decision`, `decided_at` | 用户怎么处理？ | 最终动作 |

可用 Facet: `duplicate` `similar` `outdated` `frozen` `snoozed` `high_value` `ai_suggested_close`

重复标签通过 `duplicate_cluster_id` 关联到 `duplicate_clusters` 集合。

## 快速开始

### 1. 启动后端

```bash
cd backend
cp .env.example .env
# 编辑 .env 填入你的 AI API Key
npm install
npm start
```

后端默认运行在 `http://127.0.0.1:3456`

### 2. 安装 Chrome 扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/` 目录

### 3. 使用

打开扩展侧边栏后，按以下流程操作：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 打开侧边栏 | 自动扫描所有浏览器标签（含所有窗口），也可手动点击 **🔍 扫描** |
| 2 | 选择模型 | 在头部模型选择器切换 AI 模型（多模型时显示） |
| 3 | 点击 **🤖 AI 分类** | 弹出选择：全部分类 / 仅未处理 / 仅已选；5 阶段流水线全程可视化 |
| 4 | 点击 **🧹 引导清理** | 渐进式 5 阶段（重复→过时→相似→冻结→分类），先概览再决策，最后汇总确认 |
| 5 | 点击 **🔗 去重** | 发现 URL 完全重复和标题相似的标签 |
| 6 | 点击 **🧬 画像** | 生成深度分析报告：主题聚类、人物画像、清理建议 |
| 7 | 点击 **📤 导出** | 导出为 JSON / Markdown / Apple Notes 格式 |

### 单标签操作

每个标签右侧有快捷操作按钮：

| 按钮 | 功能 | 说明 |
|------|------|------|
| 📝 | 总结 | 弹出选择简洁/详细，AI 流式实时输出，支持追问会话 |
| 📸 | 快照 | 保存网页 HTML（图片内嵌）+ 文本 + 截图到本地 |
| ⏰ | 稍后读 | 设定提醒时间，到期推送桌面通知 |
| ⭐ | 收藏 | 选择目标文件夹保存到 Chrome 书签 |
| ↗ | 跳转 | 切换到该标签页（自动激活对应窗口，支持冻结标签） |
| ✕ | 关闭 | 关闭标签页并记录到后端 |

### 批量操作

勾选多个标签后，底部工具栏可执行：
- **关闭** — 批量关闭选中的标签
- **稍后读** — 为所有选中标签设定同一提醒时间
- **收藏** — 批量保存到书签
- **总结** — 逐一生成 AI 摘要
- **AI分类** — 对选中标签单独执行 AI 智能分类（增量模式）

### 快速定位与导航

- 点击筛选栏中的 **定位当前**，可自动定位到浏览器当前激活标签在侧边栏中的位置
- 若当前标签尚未出现在列表，工具会自动重扫一次并再次定位
- 双击标题 "Tab Helper" 可快速回到列表顶部
- 搜索框输入后右侧出现 × 清空按钮

### 分类级操作

每个分类组标题左侧有全选复选框，右侧有：
- 📊 **总结** — AI 生成该分类下所有标签的综合总结（主题、优先阅读、重复、过时、笔记卡片）
- ⭐ **收藏** — 选择文件夹后将所有标签保存到书签子文件夹
- ✕ **关闭** — 关闭该分类所有标签

### 工具栏功能

侧边栏头部提供以下工具按钮：

| 按钮 | 功能 |
|------|------|
| 🔖 收藏夹 | 浏览和管理 Chrome 书签，支持查看/打开/删除 |
| 📊 日志 | 查看所有 AI/LLM API 调用记录（provider、model、tokens、耗时） |
| 💾 会话 | 保存当前所有标签为会话快照 |
| 📂 历史 | 查看历史会话，支持按需勾选恢复 |
| 📸 快照 | 查看所有页面快照 |
| 🕸️ 图谱 | 标签关系图谱（力导向布局，hover/click 交互，关系类型筛选） |
| 🔬 研究 | 查看自动识别的研究会话 |
| 📊 周报 | 查看标签活动周报摘要 |

### Popup 快捷面板

点击扩展图标弹出的快捷面板提供：
- 标签数 / 域名数统计
- 快速扫描（Top 10 域名分布）
- **总结当前页**：一键对当前激活的标签页生成 AI 摘要

## 页面快照

快照功能将网页内容保存到本地，防止页面失效后丢失重要信息。

**存储位置：** `backend/data/snapshots/`

```
backend/data/snapshots/
├── _index.json              # 快照索引（元数据）
├── {uuid}.html              # HTML 完整快照（带样式的可读页面）
├── {uuid}.txt               # 纯文本内容
├── {uuid}.png               # 页面截图
└── {uuid}.mhtml             # MHTML 完整归档
```

**使用方式：**

1. 在标签右侧点击 📸 按钮保存快照
2. 在侧边栏点击 📸 快照 查看所有快照
3. 每个快照可打开 HTML 预览、查看截图或删除

**API 操作：**

```bash
# 查看所有快照
curl http://127.0.0.1:3456/api/snapshots

# 查看快照 HTML
curl http://127.0.0.1:3456/api/snapshots/{id}/html

# 查看快照纯文本
curl http://127.0.0.1:3456/api/snapshots/{id}/text

# 查看截图
curl http://127.0.0.1:3456/api/snapshots/{id}/screenshot --output screenshot.png

# 删除快照
curl -X DELETE http://127.0.0.1:3456/api/snapshots/{id}
```

## 深度分析 & 人物画像

基于所有标签数据进行多维度分析，生成结构化报告。

**分析维度：**

| 维度 | 内容 |
|------|------|
| 总体概览 | 标签总数、独立域名数、重复数、失效页面数、语言分布 |
| 主题聚类 | 18 个方向自动聚类（LLM/RAG/Prompt/Agent/IoT/安全/前端/Go...） |
| 平台来源 | 15 个平台识别（GitHub/微信/看雪/B站/掘金/Medium...） |
| 域名分布 | Top 20 域名及代表性标签 |
| 关键词 | 英文/中文关键词频次 Top 20 |
| 重复检测 | URL 完全重复分组 |
| 问题标签 | 死链(404)、登录页(已失效)、本地开发页 |
| 人物画像 | 核心身份、技术兴趣图谱、学习风格、性格特征 |
| 清理建议 | 量化的清理优先级和预估效果 |

**使用方式：**

1. 在侧边栏扫描标签后，点击 **🧬 画像** 按钮
2. 或通过 API：`GET /api/tabs/analysis`
3. 或通过 MCP 工具：`analyze_tabs`

**API 返回示例：**

```json
{
  "overview": { "total": 254, "uniqueDomains": 125, "dupRemovable": 26 },
  "topics": [{ "name": "LLM/大语言模型", "count": 53, "pct": 20.9 }],
  "platforms": [{ "name": "GitHub", "count": 76, "pct": 29.9 }],
  "persona": {
    "identity": ["AI/LLM 深度研究者", "嵌入式/IoT 专业开发者"],
    "techInterests": [{ "name": "LLM/大语言模型", "count": 53, "intensity": "hot" }],
    "learningStyle": ["源码驱动 — 习惯深入代码层面理解技术"],
    "traits": [{ "trait": "好奇心强", "evidence": "254 个标签，125+ 域名" }],
    "cleanup": { "immediate": 38, "estimatedAfter": 213 }
  }
}
```

## AI Provider 配置

在 `.env` 中配置：

```env
AI_PROVIDER=openai    # openai | claude | ollama

# OpenAI (也支持兼容 API: NVIDIA NIM, Azure OpenAI, vLLM, LiteLLM 等)
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=              # 留空使用默认 OpenAI; 填写则使用兼容 API
OPENAI_MODEL=gpt-4o-mini

ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_MODEL=claude-sonnet-4-20250514

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# 日志
LOG_API_CALLS=true            # 是否记录 API 调用日志
LOG_MAX_ENTRIES=500           # 最大日志保留条数
```

如果配置了多个 provider 的 API Key，可在侧边栏界面的模型选择器中运行时切换。

## REST API

### 标签管理

```
GET  /api/health                    健康检查 + 统计
GET  /api/tabs                      活跃标签列表 (?facets=duplicate,outdated&topic=tech)
GET  /api/tabs/all                  全部标签（含已关闭）
GET  /api/tabs/:id                  单个标签详情
GET  /api/tabs/categories           分类列表及数量
GET  /api/tabs/stats                统计数据
GET  /api/tabs/facet-stats          Facet 分布统计 { facets: { duplicate: 5, outdated: 12, ... } }
GET  /api/tabs/duplicate-clusters   重复集群列表
GET  /api/tabs/search?q=keyword     搜索标签
GET  /api/tabs/analysis             深度分析 + 人物画像
GET  /api/tabs/models               可用 AI 模型列表
GET  /api/tabs/api-logs             API 调用日志 (?limit=50&offset=0)
DELETE /api/tabs/api-logs           清空日志
GET  /api/tabs/categorize-stream    SSE 5阶段流式分类 (?model=xxx&tabIds=id1,id2)，返回含 facetStats
GET  /api/tabs/summarize-stream/:id SSE 流式总结 (?detailed=true&model=xxx)
GET  /api/tabs/follow-up-stream     SSE 流式追问 (?conversationId&question&model)
POST /api/tabs/sync                 从扩展同步标签数据（自动计算 stale_days/is_frozen/facets）
POST /api/tabs/content              更新标签页面内容
POST /api/tabs/categorize           AI 智能分类 (body: {model?, tabIds?[]})，返回含 facetStats
POST /api/tabs/summarize/:id        AI 摘要 (body: {detailed?, model?})
POST /api/tabs/follow-up            追问会话 (body: {conversationId, question, model?})
POST /api/tabs/summarize-group/:id  AI 分类级总结 (body: {model?})
POST /api/tabs/close-batch          批量关闭标签
POST /api/tabs/sessions             保存当前会话
GET  /api/tabs/sessions/list        会话列表
PATCH /api/tabs/:id/status          更新状态 (active/closed/archived)
PATCH /api/tabs/:id/category        更新分类（兼容旧接口）
PATCH /api/tabs/:id/topic           更新主题 (body: {topicId, confidence?, source?})
PATCH /api/tabs/:id/facets          更新 Facet (body: {add?: [], remove?: []})
PATCH /api/tabs/:id/decision        记录决策 (body: {decision?, recommendation?})
DELETE /api/tabs/:id                删除标签
```

### 导出

```
GET  /api/export/json               JSON 结构化导出
GET  /api/export/markdown           Markdown 报告
GET  /api/export/notes              Apple Notes 笔记卡片
```

### 快照

```
POST /api/snapshots                 保存快照 (html/text/screenshot/mhtml)
GET  /api/snapshots                 快照列表
GET  /api/snapshots/:id             快照元数据
GET  /api/snapshots/:id/html        HTML 预览
GET  /api/snapshots/:id/text        纯文本内容
GET  /api/snapshots/:id/screenshot  页面截图 (PNG)
GET  /api/snapshots/:id/mhtml       MHTML 归档
DELETE /api/snapshots/:id           删除快照
```

## MCP Server

在 Cursor 或 Claude Desktop 中配置：

```json
{
  "mcpServers": {
    "chrome-tab-helper": {
      "command": "node",
      "args": ["/path/to/chrome_tab_helper/backend/src/mcp/server.js"]
    }
  }
}
```

### 可用工具 (12 个)

| 工具 | 说明 |
|------|------|
| `list_tabs` | 列出标签，支持按状态/分类过滤 |
| `get_tab` | 获取单个标签详情 |
| `list_categories` | 分类列表及数量 |
| `categorize_tabs` | AI 智能分类 |
| `summarize_tab` | AI 摘要单个标签 |
| `summarize_category` | AI 总结整个分类 |
| `close_tabs` | 关闭指定标签 |
| `update_tab_category` | 修改标签分类 |
| `search_tabs` | 搜索标签 |
| `get_stats` | 统计数据 |
| `export_markdown` | Markdown 导出 |
| `analyze_tabs` | 深度分析 + 人物画像 |

## 数据存储

```
backend/data/
├── tabs.json                 # 标签、分类、会话、设置数据
└── snapshots/
    ├── _index.json           # 快照索引
    ├── {uuid}.html           # HTML 快照
    ├── {uuid}.txt            # 文本快照
    ├── {uuid}.png            # 截图
    └── {uuid}.mhtml          # MHTML 归档
```

## 独立分析脚本

仓库提供独立 Python 脚本进行更详细的分析：

```bash
# 无依赖，直接运行
python3 scripts/analyze-tabs.py --output reports/my-report.md

# 指定后端地址
python3 scripts/analyze-tabs.py --api http://192.168.1.100:3456 -o report.md
```

输出包含域名分布、主题聚类、重复检测、关键词热度、分类分布的完整 Markdown 报告。

## 最近更新

### v1.2 (2026-03)

#### 内容提取升级
- **Mozilla Readability 集成**：正文提取改用 Firefox 阅读器模式引擎（Readability.js），智能过滤导航/广告/侧边栏，支持各类网站（新闻、博客、GitHub、论坛），三级 fallback（Readability → DOM 选择器 → body.innerText），字符上限提升至 15000

#### 快照图片保存修复
- **相对 URL 解析**：Content Script 在提取前将所有 `<img>` 的相对 `src`/`data-src` 通过 `document.baseURI` 转为绝对 URL
- **后端预处理**：新增 `resolveRelativeUrls` 函数，处理残留 `/path` 形式的图片引用
- **懒加载支持**：处理 `data-src`、`data-original`、`data-lazy-src`、`data-srcset` 等懒加载属性

#### 向导清理增强
- **决策取消**：点击同一决策按钮可取消选择（toggle 行为），而不只能切换
- **决策汇总页**：最后阶段后进入 📋 汇总页面，按决策类型分组展示所有决策，每条可修改/取消，底部「确认执行」按钮
- **导航角标**：每个阶段圆点右上角显示红色角标（已决策数量），汇总按钮显示蓝色角标（总决策数），实时更新
- **从任意阶段跳转汇总**：导航栏末尾的 📋 按钮可从任何阶段直接进入决策汇总页

#### UI 改进
- **快照浏览**：快照列表标题可点击直接浏览 HTML 快照，按钮增加 tooltip 说明
- **定位当前标签修复**：改用后台 Service Worker 获取当前标签（更可靠），三级匹配（chromeTabId → tab-ID → URL），修复筛选清除时字段名错误
- **搜索清空按钮**：搜索框输入内容后右侧显示 × 清空按钮
- **双击标题回顶部**：双击 "Tab Helper" 标题可快速回到列表顶部
- **布局修复**：`#app` 改为 `height: 100vh`，`#tabList` 成为正确的滚动容器
- **图谱 fallback**：后端无数据时使用前端标签按域名关系生成本地图谱；切换过滤器重新运行物理模拟；连线透明度提升

### v1.1 (2026-03)

#### 分类数据持久化
- **浏览器重启后分类数据恢复**：`upsertTab` 支持 URL 匹配继承——当 Chrome 重启导致 tab ID 变化时，自动从同 URL 的历史记录继承 `topic_id`、`summary`、`priority_score` 等分类数据，不再丢失
- **选择性 AI 重分类**：点击「AI 分类」按钮时弹出选择弹窗（全部 / 仅未处理 / 仅已选），批量操作栏新增「AI分类」按钮；后端 `categorize-stream` 和 `categorize` 端点支持 `tabIds` 参数

#### Bug 修复
- **搜索功能修复**：恢复 `#filterSearch` 的 `input` 事件绑定（模块化过程中丢失）
- **模型选择器修复**：正确渲染模型对象的 `label` 字段（修复显示 `[object Object]`），默认模型自动选中，切换模型正确更新 `state.selectedModel`
- **图谱动画修复**：修复 `hoveredIdx` 变量声明顺序导致的 `ReferenceError`（let 暂时性死区），恢复力导向动画
- **去重窗口实时更新**：外部关闭/新增标签时，若去重模态窗口已打开则自动刷新内容
- **分类筛选修复**：`#categoryFilter` → `#filterCategory` ID 不匹配修复
- **自定义稍后读修复**：恢复 `#btnSnoozeCustom` 的 click 事件绑定
- **被动感知增强**：TAB_UPDATED 和 TAB_CREATED 事件也触发 duplicate indicators 和 facet counts 刷新

### v1.0 (2026-03)

#### Bug 修复
- **被动标签感知**：Service Worker 监听 `chrome.tabs.onRemoved/onUpdated/onCreated`，外部关闭/新增/更新标签实时反映到侧栏
- **AI 分类历史标签问题**：`/sync` 时自动将不在浏览器中的标签标记为 `closed`，确保 AI 只分类当前活跃标签
- **重复标签交互**：重复/相似 badge 可点击，弹出浮窗显示重复组成员（激活/关闭），组内标签排序聚合
- **增量扫描标记**：新增 `🆕 未处理` facet chip，未经 AI 分类的标签自动标记 `_isNew`
- **聊天操作增强**：摘要聊天窗口增加「🔍 激活」和「✕ 关闭」操作按钮
- **Wizard 重复数据展示**：重复标签阶段显示实际重复对象标题 + URL，按 cluster 排序
- **冻结判断优化**：使用 `lastAccessed`（72h 未访问）+ `discarded` 双重判断
- **总结事实约束**：AI 总结 prompt 增加"严格基于事实内容，不要杜撰"约束

#### P0 — 核心体验闭环
- **关闭上下文保留**：关闭标签时弹出原因选择（已解决/不需要了/已收藏/直接关闭），数据存入 `close_context`
- **深色模式**：完整 dark 主题变量集，支持自动（跟随系统）/ 浅色 / 深色三种模式切换
- **AI 优先级评分**：综合年龄、时效、AI 推荐、重复/冻结状态，生成 0-1 的 `priority_score`；新增"按优先级"排序选项

#### P1 — 智能深化
- **Research Session 识别**：自动检测短时间内同主题/域名打开的标签群，识别为研究会话
- **标签关系图谱**：Canvas 力导向图可视化标签间关系（同域名/同分类/重复），节点大小反映优先级，hover 显示详情，点击激活标签，关系类型筛选，底部图例
- **个性化分类学习**：记录用户对分类的修正（feedback），统计偏好模式，API 可查询个性化偏好
- **周报自动摘要**：后端周报端点（新增/关闭/热门主题/积灰最久），Service Worker 定时通知，前端周报查看器
- **响应式状态管理**：前端 state 改为 Proxy 代理 + `onStateChange` 订阅机制，为未来 Preact 迁移奠基

#### 工程优化
- **前端模块化**：`app.js` 拆分为 `categorize.js`、`graph.js`、`snooze.js`、`sessions.js`、`research.js` 等独立模块
- **Wizard 导航改进**：stage-nav 支持 flex-wrap 自动换行，域名分类使用首字母彩色图标，阶段可点击跳转
- **自动扫描**：打开侧面板时自动执行标签扫描，无需手动点击

### v0.9 (2026-03)
- **数据持久化修复**：`/sync` 路由和 `applyCategorizations` 中的 facet/推荐/时效字段现在正确持久化到磁盘
- **Markdown 渲染重写**：从正则替换链改为逐行解析器，正确支持标题、有序/无序列表、引用块、行内代码
- **Wizard UI 重新设计**：产品级视觉 — Hero 阶段卡片、渐变流光进度条、胶囊决策按钮、卡片式标签行、自适应宽度
- **聊天自动滚动修复**：修复 flex 布局链高度传递，确保流式消息自动滚动到底部
- **z-index 层级修复**：引导窗口中打开的弹窗（总结等）不再被遮挡

## 后续升级方向

### P2 — 架构升级

| 方向 | 说明 | 预期影响 |
|------|------|---------|
| **JSON → SQLite** | 当前 JSON 文件存储在标签量大 (>1000) 时会出现性能瓶颈（全量读写）。迁移到 SQLite（使用 `sql.js` 避免 native 编译问题）可实现增量查询。 | 千级标签性能保障 |
| **Preact 组件化** | 当前已建立响应式 Proxy state，下一步将高频组件（tab list、filter bar、batch bar）改为 Preact 声明式组件。 | 代码可维护性 |
| **Service Worker 持久化** | 让 Service Worker 维护标签状态的 IndexedDB 副本，减少对后端的依赖。离线时也能提供基本的标签浏览和搜索。 | 离线可用性 |
| **E2E 测试** | 使用 Puppeteer/Playwright 编写核心流程的端到端测试（扫描→分类→清理→导出），防止回归。 | 质量保障 |

### P3 — 扩展生态

| 方向 | 说明 |
|------|------|
| **跨设备同步** | 通过 Chrome Sync Storage 或自建 WebSocket 服务同步标签状态 |
| **Obsidian / Notion 集成** | 导出格式适配 Obsidian vault 结构（YAML frontmatter + wiki links）或 Notion API |
| **标签分享** | 将一组标签导出为可分享的"研究集"URL（类似 OneTab 分享页） |
| **拖拽分类调整** | 拖拽标签到不同分类组，或拖拽改变分类排序 |
| **阅读进度追踪** | 利用 content script 检测页面滚动位置，记录阅读完成度 |

### 设计哲学笔记

这个工具解决的核心问题不是"如何管理标签"，而是"如何降低信息焦虑"。真正的用户旅程是：

```
焦虑（"我有300个标签"）
  → 可见性（"原来都是这些类型"）
    → 信心（"AI 说这些可以安全关闭"）
      → 行动（渐进式清理）
        → 习惯（定期整理，不再积累）
```

每一期升级都应该沿这条路径加深某一环节的体验，而不是横向堆砌功能。

## 技术栈

- **Extension**: Chrome Manifest V3, ES Modules, CSS Custom Properties, Reactive Proxy State, Mozilla Readability
- **Backend**: Node.js, Express, JSON File Storage, SSE (Server-Sent Events)
- **AI**: OpenAI SDK (支持兼容 API), Anthropic SDK, Ollama REST API
- **MCP**: @modelcontextprotocol/sdk
- **Analysis**: 内置 JS 分析引擎 + 独立 Python 脚本
- **UI**: Apple HIG 风格设计（浅色/深色），毛玻璃效果，弹簧动画，Canvas 图谱可视化
