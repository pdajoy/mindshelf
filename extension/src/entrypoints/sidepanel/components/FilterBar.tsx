import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useTabStore, useTopics } from '../stores/tab-store';
import { useNavStore } from '../stores/nav-store';
import type { TabViewMode } from '../App';
import { Search, X, List, LayoutGrid, Crosshair } from 'lucide-react';
import { useT } from '@/lib/i18n';

interface FilterBarProps {
  viewMode: TabViewMode;
  onViewModeChange: (mode: TabViewMode) => void;
}

export function FilterBar({ viewMode, onViewModeChange }: FilterBarProps) {
  const { t } = useT();
  const { filter, setFilter, topicFilter, setTopicFilter, searchQuery, setSearchQuery, tabs } = useTabStore();
  const { requestLocate } = useNavStore();
  const topics = useTopics();

  const unclassifiedCount = tabs.filter(t => !t.topic).length;

  const locateActiveTab = useCallback(async () => {
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!active?.url) return;
      const match = tabs.find(t => t.url === active.url);
      if (!match) {
        requestLocate('__not_found__');
        return;
      }
      requestLocate(match.id);
    } catch {}
  }, [tabs, requestLocate]);

  const handleTopicClick = (topic: string | null) => {
    if (topic === null) {
      setFilter('all');
      setTopicFilter(null);
    } else if (topic === '__unclassified__') {
      setFilter('unprocessed');
      setTopicFilter(null);
    } else {
      setFilter('all');
      setTopicFilter(topicFilter === topic ? null : topic);
    }
    if (viewMode === 'duplicates') onViewModeChange('list');
  };

  const isAllActive = filter === 'all' && !topicFilter && viewMode !== 'duplicates';
  const isUnclassifiedActive = filter === 'unprocessed' && !topicFilter;

  return (
    <div className="space-y-1.5 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('filter.searchPlaceholder')}
            className="w-full h-7 pl-8 pr-7 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onViewModeChange('list')}
            className={cn('p-1.5 rounded transition-colors', viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            title={t('filter.listView')}
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('grouped')}
            className={cn('p-1.5 rounded transition-colors', viewMode === 'grouped' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            title={t('filter.groupView')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={locateActiveTab}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={t('filter.locateTab')}
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {viewMode !== 'duplicates' && (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => handleTopicClick(null)}
            className={cn(
              'px-2 py-0.5 text-[10px] rounded-full transition-colors',
              isAllActive ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t('filter.all')} ({tabs.length})
          </button>
          {topics.map(({ topic, count }) => (
            <button
              key={topic}
              onClick={() => handleTopicClick(topic)}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded-full transition-colors',
                topicFilter === topic ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {topic} ({count})
            </button>
          ))}
          {unclassifiedCount > 0 && (
            <button
              onClick={() => handleTopicClick('__unclassified__')}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded-full transition-colors',
                isUnclassifiedActive ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t('filter.unclassified')} ({unclassifiedCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
