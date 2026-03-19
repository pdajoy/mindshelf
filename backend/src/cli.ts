#!/usr/bin/env node
/**
 * MindShelf CLI — unified entry point.
 *
 * Usage:
 *   npx mindshelf              # stdio MCP mode (for Cursor / Claude Desktop)
 *   npx mindshelf serve        # HTTP + WebSocket server mode
 *   npx mindshelf serve --port 4000
 *   npx mindshelf --obsidian-vault /path/to/vault
 */
import 'dotenv/config';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../package.json');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', short: 'p', default: process.env.PORT || '3456' },
    'obsidian-vault': { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  },
});

if (values.version) {
  console.log(`mindshelf ${PKG_VERSION}`);
  process.exit(0);
}

if (values.help) {
  console.log(`
MindShelf — AI-powered Chrome tab manager

Usage:
  mindshelf              Start MCP stdio server (for Cursor / Claude Desktop)
  mindshelf serve        Start HTTP + WebSocket server

Options:
  -p, --port <number>         Server port (default: 3456)
  --obsidian-vault <path>     Path to Obsidian vault directory
  -v, --version               Show version
  -h, --help                  Show this help

Examples:
  # AI client config (Cursor / Claude Desktop):
  { "command": "npx", "args": ["mindshelf"] }

  # Start server manually:
  npx mindshelf serve --port 4000

  # With Obsidian vault:
  npx mindshelf serve --obsidian-vault ~/Documents/MyVault
`);
  process.exit(0);
}

if (values['obsidian-vault']) {
  process.env.OBSIDIAN_VAULT_PATH = values['obsidian-vault'];
}

const port = parseInt(values.port!, 10);
const command = positionals[0];

if (command === 'serve') {
  const { startServerMode } = await import('./modes/server.js');
  startServerMode(port);
} else {
  const { startStdioMode } = await import('./modes/stdio.js');
  await startStdioMode(port);
}
