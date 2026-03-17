import { useState, useMemo, useEffect } from 'react';
import { useFilteredTabs } from '../stores/tab-store';
import { useNavStore } from '../stores/nav-store';
import { TabItem } from './TabItem';
import { flashWhenStable } from '@/lib/scroll-flash';
import { ChevronDown, ChevronRight, Tags } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TabRecord } from '@/lib/types';

type GroupBy = 'tags' | 'topic' | 'domain';

interface GroupData {
  key: string;
  label: string;
  tabs: TabRecord[];
  collapsed: boolean;
}

export function GroupedView() {
  const tabs = useFilteredTabs();
  const { pendingLocateTabId, clearPendingLocate } = useNavStore();
  const [groupBy, setGroupBy] = useState<GroupBy>('tags');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, TabRecord[]>();

    if (groupBy === 'tags') {
      for (const tab of tabs) {
        const tags = tab.tags?.length ? tab.tags : ['未标记'];
        for (const tag of tags) {
          if (!map.has(tag)) map.set(tag, []);
          map.get(tag)!.push(tab);
        }
      }
    } else if (groupBy === 'topic') {
      for (const tab of tabs) {
        const key = tab.topic || '未分类';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(tab);
      }
    } else {
      for (const tab of tabs) {
        const key = tab.domain || '未知域名';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(tab);
      }
    }

    return Array.from(map.entries())
      .map(([key, groupTabs]) => ({
        key,
        label: key,
        tabs: groupTabs,
        collapsed: collapsed.has(key),
      }))
      .sort((a, b) => b.tabs.length - a.tabs.length);
  }, [tabs, groupBy, collapsed]);

  const toggleCollapse = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const collapseAll = () => setCollapsed(new Set(groups.map(g => g.key)));
  const expandAll = () => setCollapsed(new Set());

  const { showToast } = useNavStore();

  useEffect(() => {
    if (!pendingLocateTabId) return;
    clearPendingLocate();
    const targetId = pendingLocateTabId;

    if (targetId === '__not_found__') {
      showToast('当前标签不在列表中');
      return;
    }

    const groupsWithTab = groups.filter(g => g.tabs.some(t => t.id === targetId));
    if (groupsWithTab.length === 0) {
      showToast('当前标签不在已过滤的列表中');
      return;
    }

    setCollapsed(prev => {
      const next = new Set(prev);
      for (const g of groupsWithTab) next.delete(g.key);
      return next;
    });

    setTimeout(() => {
      const el = document.querySelector(`[data-tab-id="${targetId}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const scrollContainer = el.closest('.overflow-auto') as HTMLElement | null;
      flashWhenStable(targetId, scrollContainer);
    }, 150);
  }, [pendingLocateTabId, groups]);

  const totalTabs = tabs.length;
  const totalGroups = groups.length;

  const getGroupIcon = (groupBy: GroupBy): string => {
    switch (groupBy) {
      case 'tags': return '#';
      case 'topic': return '📂';
      case 'domain': return '🌐';
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      {/* Group Controls */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border/50 px-3 py-2 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Tags className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">分组方式：</span>
            <div className="flex gap-0.5">
              {([
                { value: 'tags' as const, label: '标签' },
                { value: 'topic' as const, label: '分类' },
                { value: 'domain' as const, label: '域名' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setGroupBy(opt.value)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                    groupBy === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{totalGroups} 组 · {totalTabs} 标签</span>
            <button onClick={expandAll} className="hover:text-foreground">展开</button>
            <span>|</span>
            <button onClick={collapseAll} className="hover:text-foreground">折叠</button>
          </div>
        </div>
      </div>

      {/* Groups */}
      <div>
        {groups.map(group => (
          <div key={group.key}>
            <button
              onClick={() => toggleCollapse(group.key)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors border-b border-border/30"
            >
              {group.collapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-xs mr-0.5">{getGroupIcon(groupBy)}</span>
              <span className="text-xs font-medium truncate">{group.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {group.tabs.length}
              </span>
            </button>
            {!group.collapsed && (
              <div>
                {group.tabs.map(tab => (
                  <div key={`${group.key}-${tab.id}`} data-tab-id={tab.id}>
                    <TabItem tab={tab} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
          没有可分组的标签
        </div>
      )}
    </div>
  );
}
