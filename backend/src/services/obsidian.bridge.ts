import fs from 'fs';
import path from 'path';

const DEFAULT_BASE_URL = 'http://127.0.0.1:27123';
const API_KEY_HEADER = 'Authorization';

interface ObsidianConfig {
  baseUrl?: string;
  apiKey?: string;
  vaultPath?: string;
}

function getConfig(): ObsidianConfig {
  return {
    baseUrl: process.env.OBSIDIAN_API_URL || DEFAULT_BASE_URL,
    apiKey: process.env.OBSIDIAN_API_KEY || '',
    vaultPath: process.env.OBSIDIAN_VAULT_PATH || '',
  };
}

function hasVaultPath(): boolean {
  const cfg = getConfig();
  return !!(cfg.vaultPath && fs.existsSync(cfg.vaultPath));
}

export async function checkAvailability(): Promise<{
  available: boolean;
  vaultName?: string;
  error?: string;
  mode?: 'file' | 'api';
}> {
  const cfg = getConfig();

  if (cfg.vaultPath) {
    if (fs.existsSync(cfg.vaultPath)) {
      const name = path.basename(cfg.vaultPath);
      return { available: true, vaultName: name, mode: 'file' };
    }
    return { available: false, error: `Vault path not found: ${cfg.vaultPath}` };
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/`, {
      headers: cfg.apiKey ? { [API_KEY_HEADER]: `Bearer ${cfg.apiKey}` } : {},
    });
    if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
    return { available: true, vaultName: 'Connected', mode: 'api' };
  } catch (err) {
    return { available: false, error: (err as Error).message };
  }
}

export async function listFolders(): Promise<string[]> {
  const cfg = getConfig();

  if (hasVaultPath()) {
    return listFoldersFromDisk(cfg.vaultPath!);
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers[API_KEY_HEADER] = `Bearer ${cfg.apiKey}`;
    const res = await fetch(`${cfg.baseUrl}/vault/`, { headers });
    if (!res.ok) return [];
    const data = await res.json() as { files: Array<{ path: string }> };
    const folders = new Set<string>();
    for (const f of data.files || []) {
      const dir = f.path.split('/').slice(0, -1).join('/');
      if (dir) folders.add(dir);
    }
    return Array.from(folders).sort();
  } catch {
    return [];
  }
}

function listFoldersFromDisk(vaultPath: string): string[] {
  const folders: string[] = [];
  const walk = (dir: string, rel: string) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        folders.push(childRel);
        walk(path.join(dir, entry.name), childRel);
      }
    } catch {}
  };
  walk(vaultPath, '');
  return folders.sort();
}

export interface CreateObsidianNoteOptions {
  title: string;
  markdown: string;
  folder?: string;
}

export async function createNote(opts: CreateObsidianNoteOptions): Promise<{ path: string }> {
  const cfg = getConfig();
  const folder = opts.folder || 'MindShelf';
  const safeTitle = opts.title.replace(/[/\\:*?"<>|]/g, '_').substring(0, 100);

  if (hasVaultPath()) {
    return createNoteFile(cfg.vaultPath!, folder, safeTitle, opts.markdown);
  }

  return createNoteAPI(cfg, folder, safeTitle, opts.markdown);
}

function createNoteFile(vaultPath: string, folder: string, safeTitle: string, markdown: string): { path: string } {
  const dirPath = path.join(vaultPath, folder);
  fs.mkdirSync(dirPath, { recursive: true });

  const filePath = path.join(dirPath, `${safeTitle}.md`);
  fs.writeFileSync(filePath, markdown, 'utf-8');

  return { path: `${folder}/${safeTitle}.md` };
}

async function createNoteAPI(cfg: ObsidianConfig, folder: string, safeTitle: string, markdown: string): Promise<{ path: string }> {
  const filePath = `${folder}/${safeTitle}.md`;
  const headers: Record<string, string> = { 'Content-Type': 'application/markdown' };
  if (cfg.apiKey) headers[API_KEY_HEADER] = `Bearer ${cfg.apiKey}`;

  const res = await fetch(`${cfg.baseUrl}/vault/${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    headers,
    body: markdown,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Obsidian API error ${res.status}: ${text}`);
  }

  return { path: filePath };
}
