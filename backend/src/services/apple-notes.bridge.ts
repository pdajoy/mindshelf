import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const exec = promisify(execFile);

function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

async function runOsascript(script: string): Promise<string> {
  const { stdout, stderr } = await exec('osascript', ['-e', script], {
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

async function runOsascriptFile(script: string): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `mindshelf_script_${Date.now()}.scpt`);
  fs.writeFileSync(tmpFile, script, 'utf-8');
  try {
    const { stdout, stderr } = await exec('osascript', [tmpFile], {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (stderr && !stdout) throw new Error(stderr.trim());
    return stdout.trim();
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

export async function checkAvailability(): Promise<{
  available: boolean;
  platform: string;
  error?: string;
}> {
  if (process.platform !== 'darwin') {
    return { available: false, platform: process.platform, error: 'Apple Notes only available on macOS' };
  }
  try {
    await runOsascript('tell application "Notes" to return name of default account');
    return { available: true, platform: 'darwin' };
  } catch (err) {
    return { available: false, platform: 'darwin', error: (err as Error).message };
  }
}

export async function listFolders(): Promise<Array<{ id: string; name: string }>> {
  const script = `
    tell application "Notes"
      set folderList to {}
      repeat with f in folders
        set end of folderList to (id of f) & "|" & (name of f)
      end repeat
      set AppleScript's text item delimiters to "\\n"
      return folderList as string
    end tell
  `;
  const output = await runOsascript(script);
  if (!output) return [];
  return output.split('\n').filter(Boolean).map(line => {
    const [id, ...nameParts] = line.split('|');
    return { id: id.trim(), name: nameParts.join('|').trim() };
  });
}

export async function createFolder(name: string): Promise<string> {
  const escaped = escapeAppleScript(name);
  const script = `
    tell application "Notes"
      try
        set f to first folder whose name is "${escaped}"
        return id of f
      on error
        set f to make new folder with properties {name:"${escaped}"}
        return id of f
      end try
    end tell
  `;
  return await runOsascript(script);
}

export async function ensureNestedFolder(folderPath: string): Promise<string> {
  const parts = folderPath.split('/').filter(Boolean);
  let currentFolderId = '';

  for (let i = 0; i < parts.length; i++) {
    const name = escapeAppleScript(parts[i]);
    if (i === 0) {
      const script = `
        tell application "Notes"
          try
            set f to first folder whose name is "${name}"
            return id of f
          on error
            set f to make new folder with properties {name:"${name}"}
            return id of f
          end try
        end tell
      `;
      currentFolderId = await runOsascript(script);
    } else {
      currentFolderId = await createFolder(parts.slice(0, i + 1).join('/'));
    }
  }
  return currentFolderId;
}

export interface CreateNoteOptions {
  title: string;
  htmlBody: string;
  folderName?: string;
}

export async function createNote(opts: CreateNoteOptions): Promise<{ id: string; name: string }> {
  const folder = opts.folderName || 'MindShelf';

  const leafFolder = folder.includes('/')
    ? folder.split('/').filter(Boolean).pop()!
    : folder;

  if (folder.includes('/')) {
    await ensureNestedFolder(folder);
  }

  const tmpHtmlFile = path.join(os.tmpdir(), `mindshelf_note_${Date.now()}.html`);
  fs.writeFileSync(tmpHtmlFile, opts.htmlBody, 'utf-8');

  const folderEsc = escapeAppleScript(leafFolder);

  const script = `
    set htmlContent to read (POSIX file "${tmpHtmlFile}") as «class utf8»
    tell application "Notes"
      try
        set targetFolder to first folder whose name is "${folderEsc}"
      on error
        set targetFolder to make new folder with properties {name:"${folderEsc}"}
      end try
      set newNote to make new note at targetFolder with properties {body:htmlContent}
      return (id of newNote) & "|" & (name of newNote)
    end tell
  `;

  try {
    const result = await runOsascriptFile(script);
    const [noteId, ...nameParts] = result.split('|');
    return { id: noteId.trim(), name: nameParts.join('|').trim() };
  } finally {
    try { fs.unlinkSync(tmpHtmlFile); } catch {}
  }
}
