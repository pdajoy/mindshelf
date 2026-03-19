# MindShelf

**Stop hoarding tabs. Start keeping knowledge.**

[中文文档](./README.zh-CN.md)

---

You know the feeling. 300 browser tabs, each one "too important to close." You can't organize them because there are too many. You can't close them because you might lose something valuable. So they just... sit there, draining your memory and your mind.

MindShelf ends this. It's an AI-powered Chrome extension that turns your tab chaos into organized knowledge — automatically classified, summarized, deduplicated, and exported to the note-taking apps you already use.

```
Anxiety ("I have 300 tabs")
  → Scan ("Oh, 20 are duplicates, the rest fall into 15 categories")
    → AI processes (classify, summarize, deduplicate, evaluate)
      → Export to notes (Apple Notes / Obsidian / Markdown)
        → Close tabs with confidence
          → Search in your notes anytime
```

## Features

- **AI Classification** — 5-stage pipeline auto-categorizes tabs into 15 fine-grained topics with streaming progress
- **AI Summaries** — One-click page summaries, multi-turn follow-up conversations, Markdown rendering
- **AI Agent** — Natural language tab operations: "close all shopping tabs", "export everything about React"
- **Duplicate Detection** — 4-level matching (exact URL > canonical URL > exact title > similar title)
- **Knowledge Export** — Save to **Apple Notes** (rich HTML), **Obsidian** (Markdown + YAML frontmatter), or download as `.md`
- **Content Extraction** — Defuddle / Readability / plaintext, switchable per tab
- **Virtual Scrolling** — Handles 2000+ tabs smoothly
- **Multi-Provider AI** — OpenAI, Anthropic, and any OpenAI-compatible API (Ollama, vLLM, Azure, etc.)
- **MCP Server** — External AI agents (Cursor, Claude Desktop) can manage your tabs via MCP
- **i18n** — Chinese and English interface with auto-detection
- **Dark Mode** — System / Light / Dark theme cycling

## Quick Start

### Option A: Extension only (recommended)

MindShelf's AI runs entirely in the browser. You only need the backend if you want to export to Apple Notes or Obsidian, or use MCP.

1. Go to [Releases](https://github.com/pda-labs/mindshelf/releases) and download the latest Chrome extension zip
2. Unzip and load in `chrome://extensions/` (Developer mode → Load unpacked)
3. Open the side panel → configure your AI provider in Settings (gear icon)
4. Done. Start scanning and classifying.

### Option B: With backend (for export & MCP)

```bash
# Backend
cd backend
cp .env.example .env    # configure Obsidian vault path if needed
npm install && npm run dev

# Extension
cd extension
npm install && npm run build
# Load extension/dist/chrome-mv3/ in chrome://extensions/

# Development (HMR)
cd extension && npm run dev
```

Or use Docker for the backend:

```bash
docker run -d -p 3456:3456 \
  -v /path/to/obsidian/vault:/vault \
  -e OBSIDIAN_VAULT_PATH=/vault \
  ghcr.io/pda-labs/mindshelf/backend:main
```

### Use it

Open the side panel → tabs are scanned automatically → click **Classify** → AI categorizes everything → click **save** on any tab → export to your notes → close tabs, worry-free.

## Architecture

```
Chrome Extension (WXT + React 19 + TailwindCSS v4 + Zustand)
    ├── Side Panel — tab list, AI chat, note export, settings overlay
    ├── Content Script — Defuddle / Readability page extraction
    ├── Background — WebSocket bridge client, tab lifecycle
    ├── Popup — quick summary & save
    ├── AI Engine — Vercel AI SDK (runs in browser, direct API calls)
    │   ├── Classification — 5-stage pipeline
    │   ├── Chat / Agent — streaming + tool calling (7 tools)
    │   └── Note optimization
    ├── i18n — i18next (zh/en)
    └── chrome.storage.local — enrichment cache (60-day TTL)
                │
                │ HTTP (export only)
                │ WebSocket (MCP bridge)
                ▼
Backend (Express + TypeScript, lightweight)
    ├── Export — Apple Notes (osascript/JXA) · Obsidian (direct file write)
    ├── MCP Server — 10 tools via @modelcontextprotocol/sdk
    └── WebSocket Bridge — relays MCP commands to extension
```

**Key design decision**: AI runs in the extension, not the backend. This means:
- No API key stored on server — users configure providers directly in the extension
- No backend needed for core features (scan, classify, summarize, chat)
- Backend is optional — only needed for export to Apple Notes/Obsidian and MCP integration

## Configuration

### AI Providers (in extension Settings)

Click the gear icon → **AI Providers**:
- Add multiple providers (OpenAI, Anthropic, or any OpenAI-compatible API)
- Each provider can have multiple models
- Set API key, base URL, and model list per provider
- Activate one provider and select a default model

### Backend (optional)

Create `backend/.env` from `.env.example`:

```env
PORT=3456

# Obsidian export (direct file write to vault directory)
# OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
```

### MCP Integration

MindShelf exposes 10 tools via MCP for external AI agents.

**Cursor / Claude Desktop** (stdio):
```json
{
  "mcpServers": {
    "mindshelf": {
      "command": "npx",
      "args": ["tsx", "/path/to/backend/src/mcp/stdio.ts"]
    }
  }
}
```

Requirements: Backend must be running, and the Chrome extension side panel must be open (to establish the WebSocket bridge).

| MCP Tool | Description |
|----------|-------------|
| `list_tabs` | List all browser tabs (with filters) |
| `search_tabs` | Search tabs by keyword |
| `get_tab_detail` | Get enriched tab details |
| `close_tabs` | Close tabs by ID |
| `categorize_tabs` | Trigger AI classification |
| `detect_duplicates` | Find duplicate tabs |
| `get_page_content` | Extract active page content |
| `summarize_tab` | Get/generate AI summary |
| `export_to_notes` | Export tab to Apple Notes |
| `export_to_obsidian` | Export tab to Obsidian |

## API

The backend exposes a minimal API surface:

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check (includes bridge connection status) |
| `POST /api/export/single` | Export to Apple Notes / Obsidian |
| `GET /api/export/targets` | Check available export targets |
| `GET /api/export/folders/apple-notes` | List Apple Notes folders |
| `GET /api/export/folders/obsidian` | List Obsidian vault folders |
| `ws://…/ws/bridge` | WebSocket bridge for MCP ↔ Extension |

## CI/CD

GitHub Actions builds on every push to `main`:
- **Chrome Extension** — built & packaged as downloadable zip artifact
- **Backend Docker Image** — multi-stage build (`tsc` → `node:22-alpine`), pushed to GHCR

Tag `v*` to create a GitHub Release with the extension zip attached.

## License

[MIT](LICENSE)
