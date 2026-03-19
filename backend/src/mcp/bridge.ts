import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type { Server } from 'http';

const REQUEST_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let extensionSocket: WebSocket | null = null;
const pending = new Map<string, PendingRequest>();
let pingTimer: ReturnType<typeof setInterval> | null = null;

export function isExtensionConnected(): boolean {
  return extensionSocket !== null && extensionSocket.readyState === WebSocket.OPEN;
}

export function invoke(method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!isExtensionConnected()) {
      return reject(new Error('Chrome extension is not connected. Open the MindShelf side panel to establish the bridge.'));
    }

    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Bridge request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${method}`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    extensionSocket!.send(JSON.stringify({ id, method, params }));
  });
}

export function mountWebSocketBridge(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws/bridge') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    if (extensionSocket && extensionSocket.readyState === WebSocket.OPEN) {
      extensionSocket.close(1000, 'replaced');
    }
    extensionSocket = ws;
    console.log('[Bridge] Extension connected');

    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, PING_INTERVAL_MS);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const req = pending.get(msg.id);
        if (!req) return;
        clearTimeout(req.timer);
        pending.delete(msg.id);
        if (msg.error) req.reject(new Error(msg.error));
        else req.resolve(msg.result);
      } catch {}
    });

    ws.on('close', () => {
      console.log('[Bridge] Extension disconnected');
      if (extensionSocket === ws) extensionSocket = null;
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      pending.forEach((req, id) => {
        clearTimeout(req.timer);
        req.reject(new Error('Extension disconnected'));
        pending.delete(id);
      });
    });

    ws.on('error', (err) => {
      console.error('[Bridge] WebSocket error:', err.message);
    });
  });
}
