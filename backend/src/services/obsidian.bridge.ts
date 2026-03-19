import fs from 'fs';
import path from 'path';

function getVaultPath(): string {
  return process.env.OBSIDIAN_VAULT_PATH || '';
}

export async function checkAvailability(): Promise<{
  available: boolean;
  vaultName?: string;
  error?: string;
}> {
  const vaultPath = getVaultPath();
  if (!vaultPath) return { available: false, error: 'OBSIDIAN_VAULT_PATH not configured' };
  if (!fs.existsSync(vaultPath)) return { available: false, error: `Vault path not found: ${vaultPath}` };
  return { available: true, vaultName: path.basename(vaultPath) };
}

export async function listFolders(): Promise<string[]> {
  const vaultPath = getVaultPath();
  if (!vaultPath || !fs.existsSync(vaultPath)) return [];

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
  const vaultPath = getVaultPath();
  if (!vaultPath) throw new Error('OBSIDIAN_VAULT_PATH not configured');

  const folder = opts.folder || 'MindShelf';
  const safeTitle = opts.title.replace(/[/\\:*?"<>|]/g, '_').substring(0, 100);
  const dirPath = path.join(vaultPath, folder);
  fs.mkdirSync(dirPath, { recursive: true });

  const filePath = path.join(dirPath, `${safeTitle}.md`);
  fs.writeFileSync(filePath, opts.markdown, 'utf-8');
  return { path: `${folder}/${safeTitle}.md` };
}
