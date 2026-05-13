import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { expect, launchExtension, test } from './fixtures';

function acceptWebSocketKey(key: string): string {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

async function startBridgeProbe(): Promise<{
  close: () => Promise<void>;
  counts: () => { health: number; upgrades: number };
}> {
  let health = 0;
  let upgrades = 0;
  const sockets = new Set<Socket>();
  const server: Server = createServer((req, res) => {
    if (req.url === '/api/health') {
      health += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: 'test', name: 'MindShelf Backend', bridge: 'disconnected' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.on('upgrade', (req, socket) => {
    if (req.url !== '/ws/bridge') {
      socket.destroy();
      return;
    }
    upgrades += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptWebSocketKey(key)}`,
      '',
      '',
    ].join('\r\n'));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(3456, () => resolve());
  });

  return {
    counts: () => ({ health, upgrades }),
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test('bridge client does not multiply health checks or websocket connects', async ({}, testInfo) => {
  let probe: Awaited<ReturnType<typeof startBridgeProbe>>;
  try {
    probe = await startBridgeProbe();
  } catch (err) {
    test.skip((err as NodeJS.ErrnoException).code === 'EADDRINUSE', 'Port 3456 is already in use; bridge probe needs the default backend port.');
    throw err;
  }
  const { context } = await launchExtension(testInfo);
  try {
    await expect.poll(() => probe.counts().upgrades).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 8_000));
    expect(probe.counts()).toEqual({ health: 1, upgrades: 1 });
  } finally {
    await context.close();
    await probe.close();
  }
});
