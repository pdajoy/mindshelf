import { useState } from 'react';
import { useTabStore } from '../stores/tab-store';
import { useAIStore } from '../stores/ai-store';
import { useNavStore, type Panel } from '../stores/nav-store';
import { useSettingsStore } from '../stores/settings-store';
import { api } from '@/lib/api';
import type { SyncedTab } from '@/lib/types';
import type { TabViewMode } from '../App';
import { RefreshCw, Sparkles, Brain, Copy, Loader2, Settings, Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  viewMode: TabViewMode;
  onViewModeChange: (mode: TabViewMode) => void;
}

export function Header({ viewMode, onViewModeChange }: HeaderProps) {
  const { activePanel, setActivePanel, toggleSettings } = useNavStore();
  const { isScanning, syncTabs, tabs, setDuplicateGroups, duplicateGroups } = useTabStore();
  const { isClassifying, classifyProgress, startClassify } = useAIStore();
  const { theme, setTheme } = useSettingsStore();
  const [detectingDups, setDetectingDups] = useState(false);

  const handleScan = async () => {
    const allTabs = await chrome.tabs.query({});
    const syncedTabs: SyncedTab[] = allTabs
      .filter((t) => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
      .map((t) => ({
        tabId: t.id!,
        windowId: t.windowId!,
        url: t.url!,
        title: t.title || 'Untitled',
        favIconUrl: t.favIconUrl,
        active: t.active,
        pinned: t.pinned,
        discarded: t.discarded || false,
        lastAccessed: t.lastAccessed,
      }));
    await syncTabs(syncedTabs);
  };

  const handleDetectDups = async () => {
    if (viewMode === 'duplicates') { onViewModeChange('list'); return; }
    setDetectingDups(true);
    try {
      const result = await api.duplicates.detect();
      setDuplicateGroups(result.groups);
      if (result.totalGroups > 0) onViewModeChange('duplicates');
    } catch {}
    setDetectingDups(false);
  };

  const cycleTheme = () => {
    const next: Record<string, 'light' | 'dark' | 'system'> = { system: 'light', light: 'dark', dark: 'system' };
    setTheme(next[theme]);
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <div className="border-b border-border shrink-0">
      <div className="flex items-center justify-between px-2 py-1.5 gap-1 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <Brain className="h-4 w-4 text-primary shrink-0" />
          <h1 className="text-xs font-semibold">MindShelf</h1>
          <span className="text-[10px] text-muted-foreground px-1 py-0.5 bg-muted rounded-full leading-none">
            {tabs.length}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {activePanel === 'tabs' && (
            <>
              <button
                onClick={() => startClassify()}
                disabled={isClassifying || tabs.length === 0}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-1 text-[11px] rounded-md transition-colors',
                  isClassifying ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-primary/10 text-primary hover:bg-primary/20',
                )}
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                {isClassifying ? `${classifyProgress?.stageName || '...'}` : '分类'}
              </button>

              <button
                onClick={handleDetectDups}
                disabled={detectingDups}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-1 text-[11px] rounded-md transition-colors',
                  viewMode === 'duplicates'
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-100/80 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
                )}
                title="重复检测"
              >
                {detectingDups ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3 shrink-0" />}
                {duplicateGroups.length > 0 ? `${duplicateGroups.length}` : '去重'}
              </button>

              <button
                onClick={handleScan}
                disabled={isScanning}
                className={cn('p-1 rounded-md transition-colors', isScanning ? 'text-primary animate-spin' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                title="扫描标签"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <button onClick={cycleTheme} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title={`主题: ${theme}`}>
            <ThemeIcon className="h-3.5 w-3.5" />
          </button>
          <button onClick={toggleSettings} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="设置">
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex border-t border-border/50">
        {([
          { key: 'tabs' as Panel, label: '📑 标签' },
          { key: 'chat' as Panel, label: '💬 AI' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActivePanel(key)}
            className={cn(
              'flex-1 px-3 py-1.5 text-xs font-medium transition-colors border-b-2',
              activePanel === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isClassifying && classifyProgress && (
        <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
            <span>阶段 {classifyProgress.stage}: {classifyProgress.stageName}</span>
            <span>{classifyProgress.processed}/{classifyProgress.total}</span>
          </div>
          <div className="mt-1 h-1 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: classifyProgress.total > 0 ? `${(classifyProgress.processed / classifyProgress.total) * 100}%` : '0%' }} />
          </div>
        </div>
      )}
    </div>
  );
}
