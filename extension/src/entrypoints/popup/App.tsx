import { useState, useEffect } from 'react';
import { Sparkles, ExternalLink, Loader2, FileEdit, MessageSquare } from 'lucide-react';
import { api, fetchSSE } from '@/lib/api';
import { MarkdownPreview } from '../sidepanel/components/MarkdownPreview';

export function App() {
  const [tabCount, setTabCount] = useState(0);
  const [domainCount, setDomainCount] = useState(0);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('mindshelf_settings').then(r => {
      const t = r.mindshelf_settings?.theme || 'system';
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      if (t === 'system') {
        root.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      } else {
        root.classList.add(t);
      }
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
      const content = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => document.body.innerText.slice(0, 10000),
      });
      const text = content[0]?.result || '';

      await api.tabs.sync([{
        url: currentTab.url!,
        title: currentTab.title || 'Untitled',
        favIconUrl: currentTab.favIconUrl,
        tabId: currentTab.id,
        windowId: currentTab.windowId!,
      }]);

      const { tabs } = await api.tabs.list();
      const match = tabs.find(t => t.url === currentTab.url);
      if (match) {
        await api.tabs.update(match.id, { content_text: text });
        for await (const msg of fetchSSE(`/api/ai/summarize/${match.id}`, {})) {
          if (msg.type === 'chunk') {
            const chunk = msg.content as string;
            if (!chunk.includes('<!--CONV:')) setSummary(prev => prev + chunk);
          }
        }
      }
    } catch (err) {
      setSummary(`Error: ${(err as Error).message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="w-[320px] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <img src="/icon-32.png" className="h-5 w-5 rounded-sm" alt="" />
        <h1 className="text-sm font-semibold">MindShelf</h1>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 p-2.5 rounded-lg bg-muted text-center">
          <div className="text-lg font-semibold">{tabCount}</div>
          <div className="text-[11px] text-muted-foreground">标签</div>
        </div>
        <div className="flex-1 p-2.5 rounded-lg bg-muted text-center">
          <div className="text-lg font-semibold">{domainCount}</div>
          <div className="text-[11px] text-muted-foreground">域名</div>
        </div>
      </div>

      {currentTab && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground truncate" title={currentTab.title}>📄 {currentTab.title}</p>

          <div className="flex gap-1.5">
            <button onClick={handleSummarize} disabled={isSummarizing} className="flex-1 flex items-center justify-center gap-1.5 h-8 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isSummarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {isSummarizing ? '生成中...' : 'AI 摘要'}
            </button>
            <button onClick={handleSaveAsNote} className="flex-1 flex items-center justify-center gap-1.5 h-8 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20">
              <FileEdit className="h-3 w-3" /> 保存为笔记
            </button>
          </div>

          {summary && (
            <div className="space-y-1.5">
              <div className="p-2.5 rounded-lg bg-muted max-h-[200px] overflow-auto">
                <MarkdownPreview content={summary} className="text-xs" />
              </div>
              <button onClick={handleContinueAsking} className="w-full flex items-center justify-center gap-1.5 h-7 text-xs rounded-md border border-primary/30 text-primary hover:bg-primary/10">
                <MessageSquare className="h-3 w-3" /> 继续追问
              </button>
            </div>
          )}
        </div>
      )}

      <button onClick={() => openSidePanel()} className="w-full flex items-center justify-center gap-1.5 h-8 text-xs rounded-md border border-border hover:bg-muted">
        <ExternalLink className="h-3 w-3" /> 打开侧边栏
      </button>
    </div>
  );
}
