import en from '@/locales/en.json';
import zh from '@/locales/zh.json';
import {
  SETTINGS_STORAGE_KEY,
  parseStoredUiPreferences,
  readStoredUiPreferences,
  resolveLanguage,
  type UiPreferences,
} from '@/lib/language';

declare const chrome: any;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    chrome.runtime.onMessage.addListener((message: { type?: string }, _sender: unknown, sendResponse: (response?: unknown) => void) => {
      if (message.type === 'EXTRACT_CONTENT_CS') {
        extractContent().then(sendResponse);
        return true;
      }
    });

    initSelectionToolbar();
  },
});

async function extractContent() {
  try {
    return {
      html: document.documentElement.outerHTML,
      title: document.title,
      url: window.location.href,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function initSelectionToolbar() {
  let prefs: UiPreferences = { language: 'auto', selectionToolbarEnabled: true };
  let prefsReady = false;
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let toolbarEl: HTMLDivElement | null = null;
  let askButton: HTMLButtonElement | null = null;
  let saveButton: HTMLButtonElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  void syncPreferences();
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || !changes[SETTINGS_STORAGE_KEY]) return;
      prefs = parseStoredUiPreferences(changes[SETTINGS_STORAGE_KEY].newValue);
      prefsReady = true;
      updateLabels();
      if (!prefs.selectionToolbarEnabled) hide();
    });
  }

  function getLabels() {
    return resolveLanguage(prefs.language) === 'zh' ? zh.selection : en.selection;
  }

  function updateLabels() {
    const labels = getLabels();
    if (askButton) askButton.textContent = `💬 ${labels.askAI}`;
    if (saveButton) saveButton.textContent = `📝 ${labels.save}`;
  }

  async function syncPreferences() {
    prefs = await readStoredUiPreferences();
    prefsReady = true;
    updateLabels();
    if (!prefs.selectionToolbarEnabled) hide();
  }

  function ensureHost() {
    if (!prefs.selectionToolbarEnabled) return;
    if (host && document.body.contains(host)) return;

    host = document.createElement('div');
    host.id = 'mindshelf-selection-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .ms-bar {
        position: absolute;
        display: flex;
        gap: 3px;
        padding: 3px;
        background: rgba(15,23,42,0.92);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        backdrop-filter: blur(8px);
        opacity: 0;
        transform: translateY(4px) scale(0.95);
        transition: opacity 0.15s ease, transform 0.15s ease;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
      }
      .ms-bar.show {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .ms-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 10px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.12s;
      }
      .ms-ask {
        background: #3b82f6;
        color: #fff;
      }
      .ms-ask:hover { background: #2563eb; }
      .ms-save {
        background: rgba(255,255,255,0.08);
        color: #e2e8f0;
      }
      .ms-save:hover { background: rgba(255,255,255,0.14); }
    `;

    toolbarEl = document.createElement('div');
    toolbarEl.className = 'ms-bar';
    askButton = document.createElement('button');
    askButton.className = 'ms-btn ms-ask';
    saveButton = document.createElement('button');
    saveButton.className = 'ms-btn ms-save';
    toolbarEl.append(askButton, saveButton);
    updateLabels();

    shadow.appendChild(style);
    shadow.appendChild(toolbarEl);
    document.body.appendChild(host);

    askButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAction('ask');
    });
    saveButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAction('save');
    });
  }

  function handleAction(action: 'ask' | 'save') {
    if (!prefsReady || !prefs.selectionToolbarEnabled) return;
    const text = window.getSelection()?.toString().trim() || '';
    if (!text) return;
    chrome.runtime.sendMessage({
      type: 'SELECTION_ACTION',
      action,
      text: text.substring(0, 8000),
      title: document.title,
      url: window.location.href,
    });
    hide();
    window.getSelection()?.removeAllRanges();
  }

  function show(x: number, y: number) {
    if (!prefsReady || !prefs.selectionToolbarEnabled) return;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    ensureHost();
    if (!toolbarEl) return;
    toolbarEl.style.left = `${x}px`;
    toolbarEl.style.top = `${y}px`;
    requestAnimationFrame(() => toolbarEl?.classList.add('show'));
  }

  function hide() {
    toolbarEl?.classList.remove('show');
  }

  function isEditableTarget(el: EventTarget | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  document.addEventListener('mouseup', (e) => {
    if (!prefsReady || !prefs.selectionToolbarEnabled) { hide(); return; }
    if (isEditableTarget(e.target)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 3) { hide(); return; }

      try {
        const range = sel!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const barW = 180, barH = 32;
        let x = rect.left + rect.width / 2 - barW / 2;
        let y = rect.top - barH - 6;
        x = Math.max(4, Math.min(x, window.innerWidth - barW - 4));
        if (y < 4) y = rect.bottom + 6;
        show(x, y);
      } catch { hide(); }
    }, 10);
  });

  document.addEventListener('click', (e) => {
    if (host && e.target !== host && !(host as any).contains?.(e.target)) {
      hideTimer = setTimeout(hide, 80);
    }
  });

  document.addEventListener('scroll', () => hide(), { passive: true, capture: true });
}
