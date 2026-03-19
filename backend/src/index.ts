import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { exportRouter } from './routes/export.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.1.0', name: 'MindShelf Backend (Export + MCP)' });
});

app.use('/api/export', exportRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(config.port, () => {
  console.log(`[MindShelf] Backend running on http://localhost:${config.port}`);
  console.log(`[MindShelf] Capabilities: Export (Apple Notes / Obsidian)`);
});
