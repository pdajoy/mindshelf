import { Router } from 'express';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, '../../data/snapshots');
mkdirSync(SNAPSHOTS_DIR, { recursive: true });

const metaPath = join(SNAPSHOTS_DIR, '_index.json');

function loadMeta() {
  if (existsSync(metaPath)) {
    try { return JSON.parse(readFileSync(metaPath, 'utf-8')); } catch { return {}; }
  }
  return {};
}

function saveMeta(meta) {
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

export const snapshotRoutes = Router();

snapshotRoutes.post('/', async (req, res) => {
  const { url, title, domain, htmlContent, textContent, screenshot, mhtml } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const id = uuidv4();
  const timestamp = new Date().toISOString();

  let processedHtml = htmlContent || '';
  let inlinedCount = 0;
  if (processedHtml) {
    processedHtml = resolveRelativeUrls(processedHtml, url);
    const result = await inlineExternalImages(processedHtml);
    processedHtml = result.html;
    inlinedCount = result.count;
  }

  if (processedHtml || screenshot) {
    const fullHtml = wrapHtml(title, url, timestamp, processedHtml, screenshot || null);
    writeFileSync(join(SNAPSHOTS_DIR, `${id}.html`), fullHtml, 'utf-8');
  }

  if (textContent) {
    writeFileSync(join(SNAPSHOTS_DIR, `${id}.txt`), textContent, 'utf-8');
  }

  if (screenshot) {
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    writeFileSync(join(SNAPSHOTS_DIR, `${id}.png`), Buffer.from(base64Data, 'base64'));
  }

  if (mhtml) {
    const base64Data = mhtml.replace(/^data:[\w/;,=]+base64,/, '');
    writeFileSync(join(SNAPSHOTS_DIR, `${id}.mhtml`), Buffer.from(base64Data, 'base64'));
  }

  const meta = loadMeta();
  meta[id] = {
    id,
    url,
    title: title || '',
    domain: domain || '',
    hasHtml: !!(htmlContent || screenshot),
    hasText: !!textContent,
    hasScreenshot: !!screenshot,
    hasMhtml: !!mhtml,
    created_at: timestamp,
    size: (htmlContent || '').length + (textContent || '').length,
  };
  saveMeta(meta);

  res.json({ id, created_at: timestamp, imagesInlined: inlinedCount });
});

snapshotRoutes.get('/', (_req, res) => {
  const meta = loadMeta();
  const list = Object.values(meta).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json({ snapshots: list });
});

snapshotRoutes.get('/proxy-image', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).json({ error: 'url parameter required' });
  }

  const lib = imageUrl.startsWith('https') ? https : http;
  const proxyReq = lib.get(imageUrl, { timeout: 10000 }, (proxyRes) => {
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      res.redirect(proxyRes.headers.location);
      return;
    }
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => res.status(502).json({ error: 'Failed to fetch image' }));
  proxyReq.on('timeout', () => { proxyReq.destroy(); res.status(504).json({ error: 'Image fetch timeout' }); });
});

snapshotRoutes.get('/:id', (req, res) => {
  const meta = loadMeta();
  const item = meta[req.params.id];
  if (!item) return res.status(404).json({ error: 'Snapshot not found' });
  res.json(item);
});

snapshotRoutes.get('/:id/html', (req, res) => {
  const filePath = join(SNAPSHOTS_DIR, `${req.params.id}.html`);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'HTML not found' });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(readFileSync(filePath, 'utf-8'));
});

snapshotRoutes.get('/:id/text', (req, res) => {
  const filePath = join(SNAPSHOTS_DIR, `${req.params.id}.txt`);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Text not found' });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(readFileSync(filePath, 'utf-8'));
});

snapshotRoutes.get('/:id/screenshot', (req, res) => {
  const filePath = join(SNAPSHOTS_DIR, `${req.params.id}.png`);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Screenshot not found' });
  res.setHeader('Content-Type', 'image/png');
  res.send(readFileSync(filePath));
});

snapshotRoutes.get('/:id/mhtml', (req, res) => {
  const filePath = join(SNAPSHOTS_DIR, `${req.params.id}.mhtml`);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'MHTML not found' });
  res.setHeader('Content-Type', 'multipart/related');
  res.setHeader('Content-Disposition', `attachment; filename="snapshot-${req.params.id}.mhtml"`);
  res.send(readFileSync(filePath));
});

snapshotRoutes.delete('/:id', (req, res) => {
  const id = req.params.id;
  const meta = loadMeta();
  if (!meta[id]) return res.status(404).json({ error: 'Snapshot not found' });

  for (const ext of ['html', 'txt', 'png', 'mhtml']) {
    const fp = join(SNAPSHOTS_DIR, `${id}.${ext}`);
    if (existsSync(fp)) unlinkSync(fp);
  }

  delete meta[id];
  saveMeta(meta);
  res.json({ ok: true });
});

function resolveRelativeUrls(html, pageUrl) {
  let baseUrl;
  try { baseUrl = new URL(pageUrl); } catch { return html; }
  return html.replace(/(src=["'])(\/[^"']+)(["'])/gi, (match, pre, path, post) => {
    try {
      const absolute = new URL(path, baseUrl.origin).href;
      return `${pre}${absolute}${post}`;
    } catch { return match; }
  });
}

function wrapHtml(title, url, timestamp, content, screenshotDataUrl) {
  const screenshotSection = screenshotDataUrl
    ? `<div class="snapshot-screenshot">
  <h2>页面截图</h2>
  <img src="${screenshotDataUrl}" alt="Page screenshot" style="border:1px solid #e5e7eb; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title || 'Snapshot')}</title>
<style>
  body { max-width: 800px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; }
  .snapshot-header { border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
  .snapshot-header h1 { font-size: 22px; margin-bottom: 8px; }
  .snapshot-meta { font-size: 13px; color: #6b7280; }
  .snapshot-meta a { color: #4f46e5; }
  .snapshot-screenshot { margin: 24px 0; }
  .snapshot-screenshot h2 { font-size: 16px; color: #374151; margin-bottom: 12px; }
  .snapshot-content { margin-top: 24px; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
<div class="snapshot-header">
  <h1>${escHtml(title || 'Untitled')}</h1>
  <div class="snapshot-meta">
    <div>原始链接：<a href="${escHtml(url)}">${escHtml(url)}</a></div>
    <div>快照时间：${timestamp}</div>
    <div>由 Tab Helper 保存</div>
  </div>
</div>
${screenshotSection}
${content ? `<div class="snapshot-content">\n${content}\n</div>` : ''}
</body>
</html>`;
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Download an image URL and return as data URI
function fetchImageAsBase64(imageUrl, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const lib = imageUrl.startsWith('https') ? https : http;
    const req = lib.get(imageUrl, { timeout: timeoutMs }, (resp) => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        fetchImageAsBase64(resp.headers.location, timeoutMs).then(resolve);
        return;
      }
      if (resp.statusCode !== 200) { resolve(null); return; }

      const contentType = resp.headers['content-type'] || 'image/png';
      const chunks = [];
      resp.on('data', (chunk) => chunks.push(chunk));
      resp.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 100) { resolve(null); return; }
        const mime = contentType.split(';')[0].trim();
        resolve(`data:${mime};base64,${buf.toString('base64')}`);
      });
      resp.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Find all external <img src="http..."> and replace with inline base64
async function inlineExternalImages(html) {
  const urlSet = new Set();
  const srcRegex = /(?:src|data-src|data-original)=["'](https?:\/\/[^"']+)["']/gi;
  for (const m of html.matchAll(srcRegex)) urlSet.add(m[1]);

  if (urlSet.size === 0) return { html, count: 0 };

  const uniqueUrls = [...urlSet];
  const urlToDataUri = {};

  const batchSize = 6;
  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(url => fetchImageAsBase64(url)));
    batch.forEach((url, idx) => {
      if (results[idx]) urlToDataUri[url] = results[idx];
    });
  }

  let count = 0;
  let result = html;
  for (const [url, dataUri] of Object.entries(urlToDataUri)) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    const before = result;
    result = result.replace(re, dataUri);
    if (result !== before) count++;
  }

  return { html: result, count };
}

