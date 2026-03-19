## What's New

### 🌐 Internationalization (i18n)
- Full Chinese/English support via `i18next` across all 12 UI components
- Language picker in Settings (auto / 中文 / English)
- AI system prompts rewritten to English for better LLM performance
- Localized export templates with language-aware metadata labels

### 🔌 MCP Server & WebSocket Bridge
- MCP server with 10 tools for external AI agents (Claude, etc.) to manage browser tabs
- WebSocket bridge architecture: `stdio → HTTP → Express → WebSocket → Extension`
- Tools: `list_tabs`, `search_tabs`, `get_page_content`, `close_tabs`, `group_tabs`, `save_tab`, `detect_duplicates`, `classify_tabs`, `export_to_notes`, `get_tab_stats`
- Auto-reconnect with exponential backoff and keepalive
- Pre-connection health check to avoid errors when backend is offline

### 📝 Obsidian Simplification
- Removed REST API integration, now file-write only
- Simpler setup: just configure `OBSIDIAN_VAULT_PATH`

### 🎨 UI Fixes
- Fixed narrow-width overflow for metadata and tags in tab list
- Dynamic row height measurement for virtualized scrolling

### 📚 Documentation
- Rewritten README.md and README.zh-CN.md for v2.1 architecture
- Updated .env.example and PLAN-v2.1.md
