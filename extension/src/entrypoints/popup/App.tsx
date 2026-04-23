import { useState, useEffect, useCallback } from 'react';
import { Sparkles, ExternalLink, Loader2, FileEdit, MessageSquare } from 'lucide-react';
import { streamSummarize } from '@/lib/ai-chat';
import { MarkdownPreview } from '../sidepanel/components/MarkdownPreview';
import { changeLanguage, useT } from '@/lib/i18n';
import { SETTINGS_STORAGE_KEY, type AppLanguage } from '@/lib/language';

type PopupSettings = {
  theme?: 'system' | 'light' | 'dark';
  language?: AppLanguage;
  providers?: Array<{ id: string; apiKey?: string }>;
  activeProviderId?: string;
  activeModel?: string;
  aiApiKey?: string;
  aiModel?: string;
};

function applyTheme(theme: 'system' | 'light' | 'dark' = 'system') {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (theme === 'system') {
    root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } else {
    root.classList.add(theme);
  }
}

async function getAIConfig() {
  try {
    const r = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    const s = r[SETTINGS_STORAGE_KEY];
    // New multi-provider format
    if (s?.providers?.length && s?.activeProviderId && s?.activeModel) {
      const p = s.providers.find((p: any) => p.id === s.activeProviderId);
      if (p?.apiKey) {
        return {
          provider: p.type || 'openai',
          apiKey: p.apiKey,
          model: s.activeModel,
          ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
        };
      }
    }
    // Legacy single-provider fallback
    if (s?.aiApiKey && s?.aiModel) {
      return {
        provider: s.aiProvider || 'openai',
        apiKey: s.aiApiKey,
        model: s.aiModel,
        ...(s.aiBaseUrl ? { baseUrl: s.aiBaseUrl } : {}),
      };
    }
  } catch {}
  return null;
}

export function App() {
  const { t } = useT();
  const [tabCount, setTabCount] = useState(0);
  const [domainCount, setDomainCount] = useState(0);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  const syncSettings = useCallback((settings?: PopupSettings) => {
    const s = settings || {};
    applyTheme(s.theme || 'system');
    changeLanguage(s.language || 'auto');
    const hasNew = !!(s.providers?.length && s.activeProviderId && s.activeModel);
    const hasLegacy = !!(s.aiApiKey && s.aiModel);
    setAiReady(hasNew || hasLegacy);
  }, []);

  useEffect(() => {
    chrome.storage.local.get(SETTINGS_STORAGE_KEY).then(r => {
      syncSettings(r[SETTINGS_STORAGE_KEY] as PopupSettings | undefined);
    }).catch(() => {});

    const settingsListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[SETTINGS_STORAGE_KEY]) return;
      syncSettings(changes[SETTINGS_STORAGE_KEY].newValue as PopupSettings | undefined);
    };
    chrome.storage.onChanged.addListener(settingsListener);

    chrome.tabs.query({}).then((tabs) => {
      const validTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
      setTabCount(validTabs.length);
      const domains = new Set(validTabs.map(t => { try { return new URL(t.url!).hostname; } catch { return ''; } }));
      setDomainCount(domains.size);
    });

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab) setCurrentTab(tab);
    });

    return () => chrome.storage.onChanged.removeListener(settingsListener);
  }, [syncSettings]);

  const openSidePanel = (triggerKey?: string, triggerValue?: string) => {
    if (triggerKey && triggerValue) {
      chrome.storage.local.set({ [triggerKey]: triggerValue }).then(() => {
        chrome.sidePanel.open({ windowId: currentTab?.windowId! });
        setTimeout(() => window.close(), 300);
      });
    } else {
      chrome.sidePanel.open({ windowId: currentTab?.windowId! });
      window.close();
    }
  };

  const handleSaveAsNote = () => {
    if (!currentTab?.url || !currentTab?.windowId) return;
    openSidePanel('mindshelf_open_note_for_url', currentTab.url);
  };

  const handleContinueAsking = () => {
    if (!currentTab?.url || !currentTab?.windowId) return;
    chrome.storage.local.set({
      mindshelf_continue_chat: JSON.stringify({
        title: currentTab.title || '',
        url: currentTab.url,
        summary,
      }),
    }).then(() => {
      chrome.sidePanel.open({ windowId: currentTab!.windowId! });
      setTimeout(() => window.close(), 300);
    });
  };

  const handleSummarize = async () => {
    if (!currentTab?.id) return;
    setIsSummarizing(true);
    setSummary('');

    try {
      const config = await getAIConfig();
      if (!config) {
        setSummary(t('chat.configureAIModel'));
        setIsSummarizing(false);
        return;
      }

      const htmlResult = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => document.documentElement.outerHTML,
      });
      const rawHtml = htmlResult[0]?.result || '';
      let text = '';
      if (rawHtml) {
        const { extractFromHTML } = await import('@/lib/content-extractor');
        const extracted = extractFromHTML(rawHtml, currentTab.url || '', 'defuddle');
        text = (extracted.plainText || extracted.markdown || '').substring(0, 10000);
      }
      const domain = currentTab.url ? new URL(currentTab.url).hostname.replace('www.', '') : '';

      for await (const chunk of streamSummarize(
        { title: currentTab.title || '', url: currentTab.url || '', domain, content_text: text },
        config as any,
      )) {
        setSummary(prev => prev + chunk);
      }
    } catch (err) {
      setSummary(`${t('popup.errorPrefix')}${(err as Error).message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="w-[320px] p-3 space-y-2.5">
      <div className="flex gap-2">
        <div className="flex-1 p-2 rounded-lg bg-muted text-center">
          <div className="text-base font-bold">{tabCount}</div>
          <div className="text-[10px] text-muted-foreground">{t('popup.tabs')}</div>
        </div>
        <div className="flex-1 p-2 rounded-lg bg-muted text-center">
          <div className="text-base font-bold">{domainCount}</div>
          <div className="text-[10px] text-muted-foreground">{t('popup.domains')}</div>
        </div>
      </div>

      {currentTab && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground truncate" title={currentTab.title}>📄 {currentTab.title}</p>

          <div className="flex gap-1.5">
            <button onClick={handleSummarize} disabled={isSummarizing || !aiReady} className="flex-1 flex items-center justify-center gap-1 h-7 text-[11px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isSummarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {isSummarizing ? t('popup.generating') : t('tabItem.aiSummary')}
            </button>
            <button onClick={handleSaveAsNote} className="flex-1 flex items-center justify-center gap-1 h-7 text-[11px] rounded-md bg-primary/10 text-primary hover:bg-primary/20">
              <FileEdit className="h-3 w-3" /> {t('tabItem.saveNote')}
            </button>
          </div>

          {!aiReady && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">{t('chat.configureAIModel')}</p>
          )}

          {summary && (
            <div className="space-y-1.5">
              <div className="p-2 rounded-lg bg-muted max-h-[180px] overflow-auto">
                <MarkdownPreview content={summary} className="text-xs" />
              </div>
              <button onClick={handleContinueAsking} className="w-full flex items-center justify-center gap-1 h-6 text-[11px] rounded-md border border-primary/30 text-primary hover:bg-primary/10">
                <MessageSquare className="h-3 w-3" /> {t('popup.continueAsking')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => {
          chrome.storage.local.set({ mindshelf_open_panel: 'chat' }).then(() => {
            chrome.sidePanel.open({ windowId: currentTab?.windowId! });
            setTimeout(() => window.close(), 300);
          });
        }} className="flex items-center justify-center gap-1 h-7 text-[11px] rounded-md border border-border hover:bg-muted">
          🤖 {t('popup.aiChat')}
        </button>
        <button onClick={() => openSidePanel()} className="flex items-center justify-center gap-1 h-7 text-[11px] rounded-md border border-border hover:bg-muted">
          <ExternalLink className="h-3 w-3" /> {t('popup.openSidePanel')}
        </button>
      </div>
    </div>
  );
}
