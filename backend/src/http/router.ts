import type { IncomingMessage, ServerResponse } from 'http';
import {
  checkTargets,
  getAppleNotesFolders,
  getObsidianFolders,
  exportTab,
  batchExport,
  type ExportTarget,
  type ExportRequest,
} from '../services/export.service.js';
import { isExtensionConnected, invoke } from '../mcp/bridge.js';

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage, limit = 10 * 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  try {
    if (path === '/api/health' && req.method === 'GET') {
      json(res, {
        status: 'ok',
        version: '2.3.0',
        name: 'MindShelf Backend',
        bridge: isExtensionConnected() ? 'connected' : 'disconnected',
      });
      return;
    }

    if (path === '/api/export/targets' && req.method === 'GET') {
      json(res, await checkTargets());
      return;
    }

    if (path === '/api/export/folders/apple-notes' && req.method === 'GET') {
      json(res, { folders: await getAppleNotesFolders() });
      return;
    }

    if (path === '/api/export/folders/obsidian' && req.method === 'GET') {
      json(res, { folders: await getObsidianFolders() });
      return;
    }

    if (path === '/api/export/single' && req.method === 'POST') {
      const body = await parseBody(req);
      const { title, url: tabUrl, domain, topic, tags, userScore, content, target, folder, locale } = body;
      if (!title || !tabUrl || !target) {
        json(res, { error: 'title, url, and target required' }, 400);
        return;
      }
      const result = await exportTab({
        title, url: tabUrl, domain, topic, tags, userScore,
        content: content || '',
        target: target as ExportTarget,
        folder,
        locale,
      });
      json(res, result);
      return;
    }

    if (path === '/api/export/batch' && req.method === 'POST') {
      const body = await parseBody(req);
      const { items, target, folder, locale } = body;
      if (!Array.isArray(items) || !target) {
        json(res, { error: 'items array and target required' }, 400);
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

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
      res.end();
      return;
    }

    if (path === '/api/bridge/invoke' && req.method === 'POST') {
      const body = await parseBody(req);
      const { method, params } = body;
      if (!method) {
        json(res, { error: 'method required' }, 400);
        return;
      }
      const result = await invoke(method, params);
      json(res, { result });
      return;
    }

    json(res, { error: 'Not found' }, 404);
  } catch (err) {
    json(res, { error: (err as Error).message }, 500);
  }
}
