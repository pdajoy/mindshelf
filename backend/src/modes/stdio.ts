/**
 * MindShelf — stdio mode (default for AI clients).
 *
 * A lightweight MCP stdio process that forwards all tool calls to the
 * running MindShelf server via HTTP. Multiple AI clients can each spawn
 * their own stdio process — they share the single server instance and
 * never conflict on ports.
 *
 * If the server isn't running, this process auto-starts it in the background.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type BridgeInvoker } from '../mcp/server.js';

const HEALTH_POLL_INTERVAL_MS = 300;
const HEALTH_TIMEOUT_MS = 8_000;

function log(msg: string): void {
  process.stderr.write(`[MindShelf stdio] ${msg}\n`);
}

async function isServerRunning(backendUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(backendUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isServerRunning(backendUrl)) return;
    await new Promise(r => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  throw new Error(`MindShelf server did not start within ${HEALTH_TIMEOUT_MS / 1000}s. Start it manually: npx mindshelf serve`);
}

async function autoStartServer(port: number): Promise<void> {
  const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli.js');

  log(`Server not running on port ${port}. Starting in background...`);

  const child = spawn(process.execPath, [cliPath, 'serve', '--port', String(port)], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env },
  });
  child.unref();

  await waitForServer(`http://localhost:${port}`);
  log('Server started successfully.');
}

export async function startStdioMode(port: number): Promise<void> {
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

  if (!(await isServerRunning(backendUrl))) {
    await autoStartServer(port);
  }

  const httpInvoke: BridgeInvoker = async (method, params) => {
    const res = await fetch(`${backendUrl}/api/bridge/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as any).error || `Bridge HTTP error: ${res.status}`);
    }
    const data = (await res.json()) as { result: unknown };
    return data.result;
  };

  const server = createMcpServer({ invoke: httpInvoke });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
