import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFilteredTabs } from '../stores/tab-store';
import { useNavStore } from '../stores/nav-store';
import { TabItem } from './TabItem';
import { flashWhenStable } from '@/lib/scroll-flash';

export function TabList() {
  const tabs = useFilteredTabs();
  const { pendingLocateTabId, clearPendingLocate } = useNavStore();
  const parentRef = useRef<HTMLDivElement>(null);

  const { showToast } = useNavStore();

  useEffect(() => {
    if (!pendingLocateTabId) return;
    clearPendingLocate();
    if (pendingLocateTabId === '__not_found__') {
      showToast('当前标签不在列表中');
      return;
    }
    const idx = tabs.findIndex(t => t.id === pendingLocateTabId);
    if (idx < 0) {
      showToast('当前标签不在已过滤的列表中');
      return;
    }
    virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
    flashWhenStable(pendingLocateTabId, parentRef.current);
  }, [pendingLocateTabId, tabs]);

  const virtualizer = useVirtualizer({
    count: tabs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8">
        <div className="text-center">
          <p className="text-lg font-medium text-foreground/60">No tabs found</p>
          <p className="mt-1">Try scanning your browser tabs first</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const tab = tabs[virtualRow.index];
          return (
            <TabItem
              key={tab.id}
              tab={tab}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
