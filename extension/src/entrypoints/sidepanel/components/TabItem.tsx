import { useState } from 'react';
import { cn, formatDomain, truncate, timeAgo } from '@/lib/utils';
import type { TabRecord } from '@/lib/types';
import { useTabStore } from '../stores/tab-store';
import { useNavStore } from '../stores/nav-store';
import { ScoreRating } from './ScoreRating';
import { NoteDialog } from './NoteDialog';
import { X, ExternalLink, Sparkles, FileEdit } from 'lucide-react';

interface TabItemProps {
  tab: TabRecord;
  style?: React.CSSProperties;
}

const topicColors: Record<string, string> = {
  'ai-ml': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'programming': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'devops': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'security': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'networking': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  'research': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'news': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'design': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'business': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'entertainment': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'social': 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  'shopping': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'reference': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'tools': 'bg-slate-100 text-slate-600 dark:bg-slate-800/30 dark:text-slate-400',
  'other': 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400',
};

export function TabItem({ tab, style }: TabItemProps) {
  const { selectedIds, toggleSelect } = useTabStore();
  const { requestSummarize } = useNavStore();
  const [showNote, setShowNote] = useState(false);
  const isSelected = selectedIds.has(tab.id);

  const handleActivate = () => {
    if (tab.source_tab_id) {
      chrome.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: tab.source_tab_id, windowId: tab.source_window_id });
    }
  };

  const handleClose = () => {
    if (tab.source_tab_id) {
      chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.source_tab_id });
    }
  };

  const topicClass = topicColors[tab.topic || 'other'] || topicColors.other;

  return (
    <div
      data-tab-id={tab.id}
      style={style}
      className={cn(
        'group flex items-start gap-2.5 px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors',
        isSelected && 'bg-primary/5',
      )}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => toggleSelect(tab.id)}
        className="mt-1 h-3.5 w-3.5 rounded border-border accent-primary shrink-0"
      />

      <img
        src={tab.favicon_url || `https://www.google.com/s2/favicons?domain=${tab.domain}&sz=32`}
        alt=""
        className="mt-0.5 h-4 w-4 shrink-0 rounded-sm"
        onError={(e) => {
          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect fill="%23e2e8f0" width="16" height="16" rx="2"/></svg>';
        }}
      />

      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium leading-snug truncate cursor-pointer hover:text-primary"
          onClick={handleActivate}
          title={tab.title}
        >
          {truncate(tab.title, 60)}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
          <span className="truncate max-w-[120px] cursor-default" title={tab.url}>{formatDomain(tab.url)}</span>
          <span>·</span>
          <span>{timeAgo(tab.scanned_at)}</span>
          {tab.topic && (
            <>
              <span>·</span>
              <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', topicClass)}>
                {tab.topic}
              </span>
            </>
          )}
          {tab.user_score && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">⭐{tab.user_score}</span>
          )}
        </div>

        {tab.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tab.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-muted rounded-md text-muted-foreground">
                {tag}
              </span>
            ))}
            {tab.tags.length > 4 && (
              <span className="text-[10px] text-muted-foreground">+{tab.tags.length - 4}</span>
            )}
          </div>
        )}

        {tab.user_score && (
          <div className="mt-0.5">
            <ScoreRating tabId={tab.id} currentScore={tab.user_score} compact />
          </div>
        )}
      </div>

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => requestSummarize(tab.id)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="AI 摘要"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setShowNote(true)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="保存为笔记"
        >
          <FileEdit className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleActivate}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="跳转标签"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="关闭标签"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {showNote && <NoteDialog tab={tab} onClose={() => setShowNote(false)} />}
    </div>
  );
}
