import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDB } from './db/index.js';
import { tabsRouter } from './routes/tabs.js';
import { aiRouter } from './routes/ai.js';
import { statsRouter } from './routes/stats.js';
import { exportRouter } from './routes/export.js';
import { duplicatesRouter } from './routes/duplicates.js';
import { contentRouter } from './routes/content.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', name: 'MindShelf Backend' });
});

app.use('/api/tabs', tabsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/stats', statsRouter);
app.use('/api/export', exportRouter);
app.use('/api/duplicates', duplicatesRouter);
app.use('/api/content', contentRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

function main() {
  initDB();

  app.listen(config.port, () => {
    console.log(`[MindShelf] Backend running on http://localhost:${config.port}`);
  });
}

main();
