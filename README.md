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
- **Multi-Provider AI** — OpenAI, Anthropic, Ollama (+ any OpenAI-compatible API)
- **Dark Mode** — System / Light / Dark theme cycling

## Quick Start

### 1. Start the backend

```bash
cd backend
cp .env.example .env    # fill in your AI API key
npm install && npm run dev
```

### 2. Build the extension

```bash
cd extension
npm install && npm run build
```

Load `extension/dist/chrome-mv3/` as an unpacked extension in `chrome://extensions/` (Developer mode on).

For development with HMR: `npm run dev`

### 3. Use it

Open the side panel → tabs are scanned automatically → click **Classify** → AI categorizes everything → click **export** on any tab → save to your notes → close tabs, worry-free.

### Docker (optional)

```bash
docker pull ghcr.io/pdajoy/mindshelf/backend:main
docker run -d -p 3456:3456 -e AI_PROVIDER=openai -e OPENAI_API_KEY=sk-xxx ghcr.io/pdajoy/mindshelf/backend:main
```

## Configuration

Create `backend/.env` from `.env.example`:

```env
AI_PROVIDER=openai              # openai | anthropic | ollama
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini
OBSIDIAN_VAULT_PATH=/path/to/vault  # direct file write, no Obsidian running needed
```

See [`.env.example`](backend/.env.example) for all options (Anthropic, Ollama, Obsidian REST API, etc).

## Architecture

```
Chrome Extension (WXT + React 19 + TailwindCSS v4 + Zustand)
    ├── Side Panel — tab list, AI chat, note export, settings
    ├── Content Script — page content extraction
    ├── Popup — quick summary & save
    └── chrome.storage.local — enrichment cache (60-day TTL)
                │
                │ HTTP / SSE
                ▼
Backend (Express + TypeScript, in-memory)
    ├── AI — Vercel AI SDK 6, multi-provider streaming
    ├── Classification — 5-stage pipeline (domain → rules → keywords → AI → merge)
    ├── Export — Markdown-first → Apple Notes HTML / Obsidian MD
    └── Bridges — Apple Notes (osascript) · Obsidian (fs / REST API)
```

## API

The backend exposes a REST + SSE API:

| Endpoint | Description |
|----------|-------------|
| `POST /api/tabs/sync` | Sync tabs from extension |
| `POST /api/ai/classify` | SSE streaming classification |
| `POST /api/ai/summarize/:id` | SSE streaming summary |
| `POST /api/ai/chat` | Chat / Agent with tool calls |
| `POST /api/export/single` | Export to Apple Notes / Obsidian |
| `GET /api/duplicates/detect` | Duplicate detection |
| `GET /api/health` | Health check |

## CI/CD

GitHub Actions builds on every push to `main`:
- **Chrome Extension** — built & packaged as downloadable zip artifact
- **Backend Docker Image** — multi-stage build (`tsc` → `node:22-alpine`), pushed to GHCR

Tag `v*` to create a GitHub Release with the extension zip attached.

## License

[MIT](LICENSE)
