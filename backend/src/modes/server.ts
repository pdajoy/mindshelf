/**
 * MindShelf — serve mode.
 * Starts HTTP server + WebSocket bridge + MCP tools.
 * This is the single long-running process. stdio clients connect to it via HTTP.
 */
import { createServer } from 'http';
import { mountWebSocketBridge } from '../mcp/bridge.js';
import { handleRequest } from '../http/router.js';

export function startServerMode(port: number): void {
  const server = createServer(handleRequest);
  mountWebSocketBridge(server);

  server.listen(port, () => {
    console.log(`[MindShelf] Server running on http://localhost:${port}`);
    console.log(`[MindShelf] WebSocket bridge: ws://localhost:${port}/ws/bridge`);
    console.log(`[MindShelf] Capabilities: Export (Apple Notes / Obsidian) + MCP Bridge`);
    console.log(`[MindShelf] Waiting for Chrome extension to connect...`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[MindShelf] Port ${port} is already in use. Another MindShelf instance may be running.`);
      console.error(`[MindShelf] Use --port <number> to specify a different port.`);
      process.exit(1);
    }
    throw err;
  });
}
