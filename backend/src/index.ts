import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config.js';
import { exportRouter } from './routes/export.js';
import { mountWebSocketBridge, isExtensionConnected } from './mcp/bridge.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '2.1.0',
    name: 'MindShelf Backend',
    bridge: isExtensionConnected() ? 'connected' : 'disconnected',
  });
});

app.use('/api/export', exportRouter);

app.post('/api/bridge/invoke', async (req, res) => {
  const { method, params } = req.body;
  if (!method) return res.status(400).json({ error: 'method required' });
  try {
    const { invoke } = await import('./mcp/bridge.js');
    const result = await invoke(method, params);
    res.json({ result });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = createServer(app);
mountWebSocketBridge(server);

server.listen(config.port, () => {
  console.log(`[MindShelf] Backend running on http://localhost:${config.port}`);
  console.log(`[MindShelf] Capabilities: Export (Apple Notes / Obsidian) + MCP + WebSocket Bridge`);
});
