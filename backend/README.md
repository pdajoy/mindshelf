# MindShelf

**AI-powered Chrome tab manager with MCP support.**

MindShelf turns your tab chaos into organized knowledge — automatically classified, deduplicated, and exported to the note-taking apps you already use.

## Install

```bash
npx mindshelf serve
```

This starts the MindShelf backend server on port 3456 with HTTP API and WebSocket bridge for the Chrome Extension.

### Options

```
npx mindshelf serve [options]

  --port, -p <number>         Port to listen on (default: 3456)
  --obsidian-vault <path>     Path to Obsidian vault for export
  --help, -h                  Show help
  --version, -v               Show version
```

## MCP Integration

MindShelf exposes 9 MCP tools for AI agents (Cursor, Claude Desktop, etc.) to manage your browser tabs.

### Cursor / Claude Desktop config

```json
{
  "mcpServers": {
    "mindshelf": {
      "command": "npx",
      "args": ["-y", "mindshelf"]
    }
  }
}
```

The stdio mode automatically starts the backend server if it's not already running.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_tabs` | List all browser tabs with filtering |
| `get_tab_detail` | Get detailed info for a specific tab |
| `get_page_content` | Extract full page content |
| `search_tabs` | Search tabs by keyword |
| `close_tabs` | Close tabs by ID |
| `group_tabs` | Group tabs by topic |
| `export_to_notes` | Export tab to Apple Notes |
| `export_to_obsidian` | Export tab to Obsidian vault |
| `get_duplicate_groups` | Find duplicate tabs |

## Architecture

```
Chrome Extension ←→ WebSocket ←→ MindShelf Server ←→ MCP (stdio) ←→ AI Clients
     (Side Panel)                   (HTTP + WS)         (proxy)      (Cursor, etc.)
```

- **`npx mindshelf serve`** — Long-running server with HTTP API + WebSocket bridge
- **`npx mindshelf`** (no args) — Lightweight stdio MCP proxy that auto-starts the server

Multiple AI clients can connect simultaneously — each gets its own stdio process, all sharing one server instance.

## Requirements

- Node.js >= 18
- MindShelf Chrome Extension installed and connected

## License

MIT
