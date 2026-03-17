import { getTabById, type TabRecordRow } from '../db/tab-repo.js';
import * as appleNotes from './apple-notes.bridge.js';
import * as obsidian from './obsidian.bridge.js';
import { marked } from 'marked';
import { randomUUID } from 'crypto';

export type ExportTarget = 'apple_notes' | 'obsidian';
export type ExportDepth = 'light' | 'standard' | 'full';

export interface ExportRequest {
  tabId: string;
  target: ExportTarget;
  depth: ExportDepth;
  folder?: string;
  model?: string;
  editedContent?: string;
  extractor?: string;
  imageUrls?: string[];
}

export interface ExportResult {
  success: boolean;
  logId: string;
  targetId?: string;
  targetPath?: string;
  error?: string;
}

// --------------- Target availability ---------------

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

// --------------- MD → HTML (for Apple Notes) ---------------

function mdToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

// --------------- Apple Notes wrapper ---------------

function wrapAppleNotes(tab: TabRecordRow, markdownBody: string): string {
  const tags = parseTags(tab.tags);
  const htmlContent = mdToHtml(markdownBody);

  const meta: string[] = [];
  meta.push(`<p>🔗 <a href="${esc(tab.url)}">${esc(tab.url)}</a></p>`);
  if (tab.topic) meta.push(`<p><strong>分类：</strong>${esc(tab.topic)}${tags.length ? ` · ${tags.map(t => '#' + esc(t)).join(' ')}` : ''}</p>`);
  else if (tags.length) meta.push(`<p><strong>标签：</strong>${tags.map(t => '#' + esc(t)).join(' ')}</p>`);
  if (tab.user_score) meta.push(`<p><strong>评分：</strong>${'⭐'.repeat(Math.min(tab.user_score, 10))} (${tab.user_score}/10)</p>`);

  return [
    `<h1>${esc(tab.title)}</h1>`,
    '<br>',
    ...meta,
    '<hr>',
    htmlContent,
    '<hr>',
    `<p style="color:gray;font-size:small">Saved by MindShelf · ${new Date().toLocaleString('zh-CN')}</p>`,
  ].join('\n');
}

// --------------- Obsidian wrapper ---------------

function wrapObsidian(tab: TabRecordRow, markdownBody: string): string {
  const tags = parseTags(tab.tags);

  const fm: Record<string, unknown> = {
    title: tab.title,
    url: tab.url,
    domain: tab.domain,
    source: 'MindShelf',
    created: new Date().toISOString(),
  };
  if (tab.topic) fm.category = tab.topic;
  if (tags.length) fm.tags = tags;
  if (tab.user_score) fm.score = tab.user_score;

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

  lines.push(`# ${tab.title}`, '', `> 🔗 [原文链接](${tab.url})`, '');

  lines.push(markdownBody);

  lines.push('', '---', `*Saved by MindShelf · ${new Date().toLocaleString('zh-CN')}*`);
  return lines.join('\n');
}

// --------------- Export ---------------

export async function exportTab(req: ExportRequest): Promise<ExportResult> {
  const logId = randomUUID();
  const tab = getTabById(req.tabId);
  if (!tab) return { success: false, logId, error: 'Tab not found' };

  const folder = req.folder || (tab.topic ? `MindShelf/${tab.topic}` : 'MindShelf');
  const maxRetries = 2;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const markdownBody = req.editedContent
        || tab.ai_summary
        || tab.content_text?.substring(0, 30000)
        || '暂无内容';

      let targetId: string | undefined;
      let targetPath: string | undefined;

      if (req.target === 'apple_notes') {
        const htmlBody = wrapAppleNotes(tab, markdownBody);
        const result = await appleNotes.createNote({ title: tab.title, htmlBody, folderName: folder });
        targetId = result.id;
      } else {
        const md = wrapObsidian(tab, markdownBody);
        const result = await obsidian.createNote({ title: tab.title, markdown: md, folder });
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

// --------------- Batch export ---------------

export async function batchExport(
  tabIds: string[],
  opts: { target: ExportTarget; depth: ExportDepth; folder?: string; model?: string },
  onProgress?: (done: number, total: number, tabId: string, result: ExportResult) => void,
): Promise<{ results: ExportResult[]; successCount: number; failCount: number }> {
  const results: ExportResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tabIds.length; i++) {
    const result = await exportTab({ tabId: tabIds[i], target: opts.target, depth: opts.depth, folder: opts.folder, model: opts.model });
    results.push(result);
    if (result.success) successCount++;
    else failCount++;
    onProgress?.(i + 1, tabIds.length, tabIds[i], result);
  }

  return { results, successCount, failCount };
}

// --------------- Helpers ---------------

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return [];
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
