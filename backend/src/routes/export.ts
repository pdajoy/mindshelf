import { Router } from 'express';
import {
  checkTargets,
  getAppleNotesFolders,
  getObsidianFolders,
  exportTab,
  batchExport,
  type ExportTarget,
  type ExportDepth,
} from '../services/export.service.js';
import { updateTab, getTabById } from '../db/tab-repo.js';

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
    const { tabId, target, depth, folder, model, editedContent, extractor, imageUrls } = req.body;
    if (!tabId || !target) return res.status(400).json({ error: 'tabId and target required' });

    const result = await exportTab({
      tabId,
      target: target as ExportTarget,
      depth: (depth || 'standard') as ExportDepth,
      folder,
      model,
      editedContent,
      extractor,
      imageUrls,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

exportRouter.post('/batch', async (req, res) => {
  const { tabIds, target, depth, folder, model } = req.body;
  if (!Array.isArray(tabIds) || !target) return res.status(400).json({ error: 'tabIds and target required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    const { successCount, failCount } = await batchExport(
      tabIds,
      { target: target as ExportTarget, depth: (depth || 'standard') as ExportDepth, folder, model },
      (done, total, tabId, result) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', done, total, tabId, ...result })}\n\n`);
      },
    );
    res.write(`data: ${JSON.stringify({ type: 'complete', successCount, failCount, total: tabIds.length })}\n\n`);
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});

exportRouter.post('/score', (req, res) => {
  try {
    const { tabId, score } = req.body;
    if (!tabId || score === undefined) return res.status(400).json({ error: 'tabId and score required' });
    if (score < 1 || score > 10) return res.status(400).json({ error: 'score must be 1-10' });
    const tab = updateTab(tabId, { user_score: score } as any);
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    res.json({ success: true, tab });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

exportRouter.post('/validate', async (req, res) => {
  try {
    const { tabId, target } = req.body;
    const tab = getTabById(tabId);
    const issues: string[] = [];
    if (!tab) issues.push('标签不存在');
    if (target === 'apple_notes') {
      const check = await checkTargets();
      if (!check.apple_notes.available) issues.push(`Apple Notes 不可用: ${check.apple_notes.error || '未知错误'}`);
    } else if (target === 'obsidian') {
      const check = await checkTargets();
      if (!check.obsidian.available) issues.push(`Obsidian 不可用: ${check.obsidian.error || '未知错误'}`);
    }
    res.json({ valid: issues.length === 0, issues });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
