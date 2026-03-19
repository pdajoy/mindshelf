import { useState } from 'react';
import { useTabStore } from '../stores/tab-store';
import { TabItem } from './TabItem';
import type { TabRecord } from '@/lib/types';
import { ChevronDown, ChevronRight, Copy, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export function DuplicateGroupView() {
  const { duplicateGroups, tabs } = useTabStore();
  const { t } = useT();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const collapseAll = () => setCollapsed(new Set(duplicateGroups.map(g => g.id)));
  const expandAll = () => setCollapsed(new Set());

  if (duplicateGroups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <Copy className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground font-medium">{t('duplicates.noDups')}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{t('duplicates.allUnique')}</p>
      </div>
    );
  }

  const totalDups = duplicateGroups.reduce((sum, g) => sum + g.tabs.length, 0);

  const reasonLabels: Record<string, string> = {
    exact_url: t('duplicates.exactUrl'),
    exact_title: t('duplicates.exactTitle'),
    similar_title: t('duplicates.similarTitle'),
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border/50 px-3 py-2 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium text-amber-700">
              {t('duplicates.groups', { count: duplicateGroups.length, total: totalDups })}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <button onClick={expandAll} className="hover:text-foreground">{t('grouped.expand')}</button>
            <span>|</span>
            <button onClick={collapseAll} className="hover:text-foreground">{t('grouped.collapse')}</button>
          </div>
        </div>
      </div>

      <div>
        {duplicateGroups.map(group => {
          const isCollapsed = collapsed.has(group.id);
          const groupTabs = group.tabs
            .map(gt => tabs.find(t => t.id === gt.id))
            .filter(Boolean);

          return (
            <div key={group.id}>
              <button
                onClick={() => toggleCollapse(group.id)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50/50 hover:bg-amber-50 transition-colors border-b border-border/30"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                )}
                <Copy className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="text-xs font-medium truncate text-amber-800">
                  {group.tabs[0]?.title || group.canonicalUrl}
                </span>
                <span className={cn(
                  'ml-auto shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                  'bg-amber-100 text-amber-700'
                )}>
                  {reasonLabels[group.reason] || group.reason}
                </span>
                <span className="text-[10px] text-amber-600 shrink-0">
                  {group.tabs.length}
                </span>
              </button>
              {!isCollapsed && (
                <div>
                  {group.tabs.map(gt => {
                    const fullTab = tabs.find(t => t.id === gt.id);
                    if (fullTab) {
                      return <TabItem key={`dup-${group.id}-${gt.id}`} tab={fullTab} />;
                    }
                    const placeholder: TabRecord = {
                      id: gt.id, url: gt.url, canonical_url: gt.url, title: gt.title,
                      domain: (() => { try { return new URL(gt.url).hostname; } catch { return ''; } })(),
                      favicon_url: '', topic: null, tags: [], ai_summary: null, ai_detailed_summary: null,
                      user_score: null, status: 'active', content_text: null,
                      language: null, word_count: null, source_tab_id: null,
                      source_window_id: null, scanned_at: gt.scannedAt, processed_at: null,
                      closed_at: null, created_at: gt.scannedAt,
                    };
                    return <TabItem key={`dup-${group.id}-${gt.id}`} tab={placeholder} />;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
