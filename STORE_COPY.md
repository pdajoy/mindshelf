# Store Copy Kit

Reusable copy for the Chrome Web Store listing and release announcements.

## Chrome Web Store

### Short Description (EN)

AI-powered tab manager that turns tab overload into organized knowledge with summaries, deduplication, note export, and MCP support.

### Short Description (ZH)

AI 驱动的标签页知识整理工具：分类、摘要、去重、导出笔记，并支持 MCP。

### Detailed Description (EN)

MindShelf is for people who always keep "too many tabs open" because every tab feels important. Instead of forcing you to choose between chaos and losing context, MindShelf turns those tabs into organized knowledge.

You can scan your open tabs, group them by topic, detect duplicates, generate AI summaries, keep asking follow-up questions, and export the useful ones to Apple Notes, Obsidian, or Markdown. The goal is simple: close tabs with confidence, and find the knowledge later when you actually need it.

Key highlights:

- AI classification across fine-grained topics
- One-click page summaries and follow-up chat
- Duplicate detection for noisy tab sets
- Save to Apple Notes, Obsidian, or `.md`
- Highlight text on any page to **Ask AI** or **Save**
- MCP support for Cursor, Claude Desktop, and other AI clients
- Local-first architecture: AI runs in the extension; the optional backend stays on your machine

### Detailed Description (ZH)

MindShelf 适合那种总觉得“这个标签页以后还会用到，所以现在不能关”的人。它不是让你被迫清理，而是把一堆暂时不敢关的标签页，转成之后真的能回看的知识。

你可以扫描当前打开的标签，按主题分类，找出重复页面，生成 AI 摘要，继续追问，并把真正值得保留的内容导出到 Apple Notes、Obsidian 或 Markdown。目标很直接：放心关标签，之后还能准确找回来。

核心亮点：

- AI 多阶段分类，适合大量标签整理
- 一键摘要 + 多轮追问
- 重复标签检测，减少噪音
- 导出到 Apple Notes、Obsidian 或 `.md`
- 网页划词后可直接 **问 AI** 或 **保存**
- 支持 MCP，可由 Cursor、Claude Desktop 等外部 AI 访问
- 本地优先：AI 直接在扩展中运行，可选后端也只在你的机器上运行

### Privacy / Permissions Summary

MindShelf does not run a hosted cloud service of its own. Tab data is processed locally in the extension, and any AI requests go directly to the provider you configure. The optional backend runs on your machine for note export and MCP bridge access.

Chrome permissions in one sentence:

- `tabs`, `activeTab`, `scripting`, `sidePanel`, `storage`, and `<all_urls>` are used only for tab management, page extraction, local persistence, and the extension UI.

## Release Copy

### Release Title

`v2.3.2 — Language Sync, Selection Actions & Docs Polish`

### Release Summary (EN)

MindShelf 2.3.2 tightens up language behavior across the extension, makes selection-driven side panel actions more reliable, and rounds out the setup docs. Popup language now follows Settings, auto-detect resolves correctly, the text selection toolbar can be disabled, and both README files now include the Chrome Web Store install path plus macOS permission guidance for MCP and Apple Notes export.

### Release Summary (ZH)

MindShelf 2.3.2 这次重点补齐了语言同步、划词动作和安装文档。现在 popup 会跟随设置里的语言，自动检测逻辑会重新按浏览器语言解析，划词工具栏可以在设置中关闭；同时中英文 README 都补上了 Chrome 商店安装入口，以及 MCP / Apple Notes 导出相关的 macOS 权限说明。

### Short Update Post (EN)

MindShelf 2.3.2 is out: popup language now follows Settings, auto language detection is fixed, text-selection actions are more reliable, and the docs now cover Chrome Web Store install plus macOS MCP permissions.

### Short Update Post (ZH)

MindShelf 2.3.2 已发布：popup 语言现在会跟随设置，自动语言检测已修复，划词动作更稳定，同时文档补上了 Chrome 商店安装入口和 macOS MCP 权限说明。
