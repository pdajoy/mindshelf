#!/usr/bin/env node
/**
 * MindShelf MCP Server — stdio transport entry point.
 *
 * Usage (Cursor / Claude Desktop):
 *   node backend/dist/mcp/stdio.js
 *   # or: npx tsx backend/src/mcp/stdio.ts
 *
 * This process communicates with the running MindShelf backend via HTTP.
 * The backend must be running for tab operations to work.
 */
import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type BridgeInvoker } from './server.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3456';

const httpInvoke: BridgeInvoker = async (method, params) => {
  const res = await fetch(`${BACKEND_URL}/api/bridge/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Bridge HTTP error: ${res.status}`);
  }
  const data = await res.json();
  return data.result;
};

const server = createMcpServer({ invoke: httpInvoke });
const transport = new StdioServerTransport();
await server.connect(transport);
