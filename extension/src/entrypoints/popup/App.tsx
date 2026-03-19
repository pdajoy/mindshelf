import { useState, useEffect } from 'react';
import { Sparkles, ExternalLink, Loader2, FileEdit, MessageSquare } from 'lucide-react';
import { streamSummarize } from '@/lib/ai-chat';
import { MarkdownPreview } from '../sidepanel/components/MarkdownPreview';

const SETTINGS_KEY = 'mindshelf_settings';

async function getAIConfig() {
  try {
    const r = await chrome.storage.local.get(SETTINGS_KEY);
    const s = r[SETTINGS_KEY];
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
  const [tabCount, setTabCount] = useState(0);
  const [domainCount, setDomainCount] = useState(0);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(SETTINGS_KEY).then(r => {
      const s = r[SETTINGS_KEY];
      const t = s?.theme || 'system';
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      if (t === 'system') {
        root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      } else {
        root.classList.add(t);
      }
      const hasNew = s?.providers?.length && s?.activeProviderId && s?.activeModel;
      const hasLegacy = s?.aiApiKey && s?.aiModel;
      setAiReady(!!(hasNew || hasLegacy));
    }).catch(() => {});

    chrome.tabs.query({}).then((tabs) => {
      const validTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
      setTabCount(validTabs.length);
      const domains = new Set(validTabs.map(t => { try { return new URL(t.url!).hostname; } catch { return ''; } }));
      setDomainCount(domains.size);
    });

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab) setCurrentTab(tab);
    });
  }, []);

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
        setSummary('请先在侧边栏设置中配置 AI API Key');
        setIsSummarizing(false);
        return;
      }

      const content = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => document.body.innerText.slice(0, 10000),
      });
      const text = content[0]?.result || '';
      const domain = currentTab.url ? new URL(currentTab.url).hostname.replace('www.', '') : '';

      for await (const chunk of streamSummarize(
        { title: currentTab.title || '', url: currentTab.url || '', domain, content_text: text },
        config as any,
      )) {
        setSummary(prev => prev + chunk);
      }
    } catch (err) {
      setSummary(`Error: ${(err as Error).message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="w-[320px] p-3 space-y-2.5">
      <div className="flex gap-2">
        <div className="flex-1 p-2 rounded-lg bg-muted text-center">
          <div className="text-base font-bold">{tabCount}</div>
          <div className="text-[10px] text-muted-foreground">标签</div>
        </div>
        <div className="flex-1 p-2 rounded-lg bg-muted text-center">
          <div className="text-base font-bold">{domainCount}</div>
          <div className="text-[10px] text-muted-foreground">域名</div>
        </div>
      </div>

      {currentTab && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground truncate" title={currentTab.title}>📄 {currentTab.title}</p>

          <div className="flex gap-1.5">
            <button onClick={handleSummarize} disabled={isSummarizing || !aiReady} className="flex-1 flex items-center justify-center gap-1 h-7 text-[11px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isSummarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {isSummarizing ? '生成中...' : 'AI 摘要'}
            </button>
            <button onClick={handleSaveAsNote} className="flex-1 flex items-center justify-center gap-1 h-7 text-[11px] rounded-md bg-primary/10 text-primary hover:bg-primary/20">
              <FileEdit className="h-3 w-3" /> 保存笔记
            </button>
          </div>

          {!aiReady && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">请在侧边栏设置中配置 AI API Key</p>
          )}

          {summary && (
            <div className="space-y-1.5">
              <div className="p-2 rounded-lg bg-muted max-h-[180px] overflow-auto">
                <MarkdownPreview content={summary} className="text-xs" />
              </div>
              <button onClick={handleContinueAsking} className="w-full flex items-center justify-center gap-1 h-6 text-[11px] rounded-md border border-primary/30 text-primary hover:bg-primary/10">
                <MessageSquare className="h-3 w-3" /> 继续追问
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
          🤖 AI Chat
        </button>
        <button onClick={() => openSidePanel()} className="flex items-center justify-center gap-1 h-7 text-[11px] rounded-md border border-border hover:bg-muted">
          <ExternalLink className="h-3 w-3" /> 打开侧边栏
        </button>
      </div>
    </div>
  );
}
