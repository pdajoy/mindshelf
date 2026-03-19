## v2.3.0 — npm Publishable Backend & Architecture Cleanup

### npm Package

MindShelf backend is now published as an npm package. Start it with a single command:

```bash
npx mindshelf serve              # HTTP + WebSocket server
npx mindshelf                    # stdio MCP mode (for Cursor / Claude Desktop)
npx mindshelf serve --obsidian-vault ~/MyVault
```

### Architecture Refactoring

- **Replaced Express.js with native Node.js HTTP** — removed 4 dependencies (`express`, `cors`, `@types/express`, `@types/cors`), faster startup, smaller package (10.4 KB)
- **Unified CLI entry point** (`backend/src/cli.ts`) — single binary for both `serve` and `stdio` modes
- **stdio mode auto-starts server** — `npx mindshelf` detects if the backend is running and spawns it in the background if needed
- **Multi-client support** — multiple AI clients (Cursor, Claude Desktop) share one server instance via lightweight stdio proxies, no port conflicts

### WebSocket Bridge Stability

- Fixed connection loop: backend now rejects duplicate WebSocket connections from the extension's service worker
- Tab data synced to `chrome.storage.local` for reliable bridge access even when side panel state differs

### Content Extraction

- `get_page_content` and export tools now auto-extract page content via `chrome.scripting.executeScript`

### Code Cleanup

- Removed `ai_summary` and `ai_detailed_summary` fields from `TabRecord` and all references across 10+ files
- Removed empty `summarize_tab` MCP tool — now 9 MCP tools total
- Removed unused `bookmarks` and `notifications` Chrome permissions
- Version numbers centralized — read from `package.json` at runtime instead of hardcoded strings

### Extension Permissions Reduced

Removed `bookmarks` and `notifications` permissions that were declared but never used, reducing the permission surface for Chrome Web Store review.

### Docker

Updated Dockerfiles to use the new CLI entry point: `node dist/cli.js serve`
