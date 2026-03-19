import * as appleNotes from './apple-notes.bridge.js';
import * as obsidian from './obsidian.bridge.js';
import { marked } from 'marked';
import { randomUUID } from 'crypto';

export type ExportTarget = 'apple_notes' | 'obsidian';

export interface ExportRequest {
  title: string;
  url: string;
  domain?: string;
  topic?: string;
  tags?: string[];
  userScore?: number;
  content: string;
  target: ExportTarget;
  folder?: string;
}

export interface ExportResult {
  success: boolean;
  logId: string;
  targetId?: string;
  targetPath?: string;
  error?: string;
}

export async function checkTargets(): Promise<{
  apple_notes: { available: boolean; error?: string };
  obsidian: { available: boolean; error?: string };
}> {
  const [an, ob] = await Promise.all([
    appleNotes.checkAvailability(),
    obsidian.checkAvailability(),
  ]);
  return {
    apple_notes: { available: an.available, error: an.error },
    obsidian: { available: ob.available, error: ob.error },
  };
}

export async function getAppleNotesFolders() {
  return appleNotes.listFolders();
}

export async function getObsidianFolders() {
  return obsidian.listFolders();
}

function mdToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapAppleNotes(req: ExportRequest): string {
  const htmlContent = mdToHtml(req.content);
  const tags = req.tags || [];

  const meta: string[] = [];
  meta.push(`<p>🔗 <a href="${esc(req.url)}">${esc(req.url)}</a></p>`);
  if (req.topic) meta.push(`<p><strong>分类：</strong>${esc(req.topic)}${tags.length ? ` · ${tags.map(t => '#' + esc(t)).join(' ')}` : ''}</p>`);
  else if (tags.length) meta.push(`<p><strong>标签：</strong>${tags.map(t => '#' + esc(t)).join(' ')}</p>`);
  if (req.userScore) meta.push(`<p><strong>评分：</strong>${'⭐'.repeat(Math.min(req.userScore, 10))} (${req.userScore}/10)</p>`);

  return [
    `<h1>${esc(req.title)}</h1>`,
    '<br>',
    ...meta,
    '<hr>',
    htmlContent,
    '<hr>',
    `<p style="color:gray;font-size:small">Saved by MindShelf · ${new Date().toLocaleString('zh-CN')}</p>`,
  ].join('\n');
}

function wrapObsidian(req: ExportRequest): string {
  const tags = req.tags || [];

  const fm: Record<string, unknown> = {
    title: req.title,
    url: req.url,
    domain: req.domain || '',
    source: 'MindShelf',
    created: new Date().toISOString(),
  };
  if (req.topic) fm.category = req.topic;
  if (tags.length) fm.tags = tags;
  if (req.userScore) fm.score = req.userScore;

  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push('---', '');
  lines.push(`# ${req.title}`, '', `> 🔗 [原文链接](${req.url})`, '');
  lines.push(req.content);
  lines.push('', '---', `*Saved by MindShelf · ${new Date().toLocaleString('zh-CN')}*`);
  return lines.join('\n');
}

export async function exportTab(req: ExportRequest): Promise<ExportResult> {
  const logId = randomUUID();
  if (!req.title || !req.url) return { success: false, logId, error: 'title and url required' };

  const folder = req.folder || (req.topic ? `MindShelf/${req.topic}` : 'MindShelf');
  const maxRetries = 2;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let targetId: string | undefined;
      let targetPath: string | undefined;

      if (req.target === 'apple_notes') {
        const htmlBody = wrapAppleNotes(req);
        const result = await appleNotes.createNote({ title: req.title, htmlBody, folderName: folder });
        targetId = result.id;
      } else {
        const md = wrapObsidian(req);
        const result = await obsidian.createNote({ title: req.title, markdown: md, folder });
        targetPath = result.path;
      }

      return { success: true, logId, targetId, targetPath };
    } catch (err) {
      lastError = (err as Error).message;
      if (attempt < maxRetries) {
        console.warn(`[Export] Attempt ${attempt + 1} failed, retrying: ${lastError}`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  return { success: false, logId, error: lastError };
}

export async function batchExport(
  items: ExportRequest[],
  onProgress?: (done: number, total: number, result: ExportResult) => void,
): Promise<{ results: ExportResult[]; successCount: number; failCount: number }> {
  const results: ExportResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i++) {
    const result = await exportTab(items[i]);
    results.push(result);
    if (result.success) successCount++;
    else failCount++;
    onProgress?.(i + 1, items.length, result);
  }

  return { results, successCount, failCount };
}
