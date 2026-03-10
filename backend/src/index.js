import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { tabRoutes } from './routes/tabs.js';
import { exportRoutes } from './routes/export.js';
import { snapshotRoutes } from './routes/snapshots.js';
import { queries } from './db.js';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  const stats = queries.getStats.get();
  res.json({ status: 'ok', stats, aiProvider: config.ai.provider });
});

app.get('/api/config', (_req, res) => {
  res.json({
    aiProvider: config.ai.provider,
    hasOpenAIKey: !!config.ai.openai.apiKey,
    hasClaudeKey: !!config.ai.claude.apiKey,
    ollamaUrl: config.ai.ollama.baseUrl,
  });
});

app.use('/api/tabs', tabRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/snapshots', snapshotRoutes);

app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, config.host, () => {
  console.log(`\n🧩 Chrome Tab Helper Backend`);
  console.log(`   http://${config.host}:${config.port}`);
  console.log(`   AI Provider: ${config.ai.provider}\n`);
});
