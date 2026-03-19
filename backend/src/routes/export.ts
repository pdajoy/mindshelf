import { Router } from 'express';
import {
  checkTargets,
  getAppleNotesFolders,
  getObsidianFolders,
  exportTab,
  batchExport,
  type ExportTarget,
  type ExportRequest,
} from '../services/export.service.js';

export const exportRouter = Router();

exportRouter.get('/targets', async (_req, res) => {
  try {
    res.json(await checkTargets());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

exportRouter.get('/folders/apple-notes', async (_req, res) => {
  try {
    res.json({ folders: await getAppleNotesFolders() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

exportRouter.get('/folders/obsidian', async (_req, res) => {
  try {
    res.json({ folders: await getObsidianFolders() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

exportRouter.post('/single', async (req, res) => {
  try {
    const { title, url, domain, topic, tags, userScore, content, target, folder, locale } = req.body;
    if (!title || !url || !target) return res.status(400).json({ error: 'title, url, and target required' });

    const result = await exportTab({
      title, url, domain, topic, tags, userScore,
      content: content || '',
      target: target as ExportTarget,
      folder,
      locale,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

exportRouter.post('/batch', async (req, res) => {
  const { items, target, folder, locale } = req.body;
  if (!Array.isArray(items) || !target) return res.status(400).json({ error: 'items array and target required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    const requests: ExportRequest[] = items.map((item: any) => ({
      title: item.title,
      url: item.url,
      domain: item.domain,
      topic: item.topic,
      tags: item.tags,
      content: item.content || '',
      target: target as ExportTarget,
      folder: item.folder || folder,
      locale,
    }));

    const { successCount, failCount } = await batchExport(
      requests,
      (done, total, result) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', done, total, ...result })}\n\n`);
      },
    );
    res.write(`data: ${JSON.stringify({ type: 'complete', successCount, failCount, total: items.length })}\n\n`);
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});
