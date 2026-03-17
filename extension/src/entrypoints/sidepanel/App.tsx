import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { TabList } from './components/TabList';
import { GroupedView } from './components/GroupedView';
import { DuplicateGroupView } from './components/DuplicateGroupView';
import { BatchBar } from './components/BatchBar';
import { ChatPanel } from './components/ChatPanel';
import { SettingsOverlay } from './components/SettingsOverlay';
import { NoteDialog } from './components/NoteDialog';
import { useTabStore } from './stores/tab-store';
import { useSettingsStore } from './stores/settings-store';
import { useNavStore } from './stores/nav-store';
import { useChatStore } from './stores/chat-store';
import { MESSAGE_TYPES } from '@/lib/types';
import type { SyncedTab, TabRecord } from '@/lib/types';

export type TabViewMode = 'list' | 'grouped' | 'duplicates';

const NOTE_TRIGGER_KEY = 'mindshelf_open_note_for_url';

function Toast() {
  const toast = useNavStore(s => s.toast);
  if (!toast) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg bg-foreground text-background text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
      {toast}
    </div>
  );
}
const CHAT_TRIGGER_KEY = 'mindshelf_continue_chat';

export function App() {
  const [viewMode, setViewMode] = useState<TabViewMode>('list');
  const [noteTab, setNoteTab] = useState<TabRecord | null>(null);
  const { activePanel, showSettings, setActivePanel } = useNavStore();
  const { syncTabs, tabs } = useTabStore();
  const { loadModels, loadFromStorage } = useSettingsStore();
  const { createSession, sendMessage } = useChatStore();

  useEffect(() => {
    const init = async () => {
      await loadFromStorage();
      loadModels();
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
    init();
  }, []);

  useEffect(() => {
    const checkNoteTrigger = async () => {
      try {
        const result = await chrome.storage.local.get(NOTE_TRIGGER_KEY);
        const url = result[NOTE_TRIGGER_KEY];
        if (url) {
          await chrome.storage.local.remove(NOTE_TRIGGER_KEY);
          const tryFind = () => {
            const match = useTabStore.getState().tabs.find(t => t.url === url);
            if (match) { setNoteTab(match); return true; }
            return false;
          };
          if (!tryFind()) setTimeout(tryFind, 1000);
        }
      } catch {}
    };

    checkNoteTrigger();

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[NOTE_TRIGGER_KEY]?.newValue) {
        const url = changes[NOTE_TRIGGER_KEY].newValue;
        chrome.storage.local.remove(NOTE_TRIGGER_KEY);
        const tryFind = () => {
          const match = useTabStore.getState().tabs.find(t => t.url === url);
          if (match) setNoteTab(match);
        };
        tryFind();
        setTimeout(tryFind, 1000);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [tabs]);

  // Auto-refresh on Chrome tab events (create/close/update)
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
  const doResync = useCallback(async () => {
    const allTabs = await chrome.tabs.query({});
    const syncedTabs: SyncedTab[] = allTabs
      .filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
      .map(t => ({
        tabId: t.id!, windowId: t.windowId!, url: t.url!, title: t.title || 'Untitled',
        favIconUrl: t.favIconUrl, active: t.active, pinned: t.pinned,
        discarded: t.discarded || false, lastAccessed: t.lastAccessed,
      }));
    await syncTabs(syncedTabs);
  }, [syncTabs]);

  useEffect(() => {
    const debouncedResync = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(doResync, 800);
    };
    const handler = (msg: any) => {
      if (msg?.type === MESSAGE_TYPES.TAB_CREATED || msg?.type === MESSAGE_TYPES.TAB_REMOVED || msg?.type === MESSAGE_TYPES.TAB_UPDATED) {
        debouncedResync();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
      clearTimeout(refreshTimer.current);
    };
  }, [doResync]);

  // Handle "continue asking" from popup
  useEffect(() => {
    const checkChatTrigger = async () => {
      try {
        const r = await chrome.storage.local.get(CHAT_TRIGGER_KEY);
        const data = r[CHAT_TRIGGER_KEY];
        if (data) {
          await chrome.storage.local.remove(CHAT_TRIGGER_KEY);
          const { title, url, summary } = JSON.parse(data);
          setActivePanel('chat');
          createSession();
          setTimeout(() => {
            const prompt = `我之前看了这个页面的摘要，想继续了解：\n标题：${title}\nURL：${url}\n\n摘要：\n${summary}\n\n请帮我深入分析这个内容。`;
            sendMessage(prompt);
          }, 200);
        }
      } catch {}
    };
    checkChatTrigger();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[CHAT_TRIGGER_KEY]?.newValue) {
        chrome.storage.local.remove(CHAT_TRIGGER_KEY);
        try {
          const { title, url, summary } = JSON.parse(changes[CHAT_TRIGGER_KEY].newValue);
          setActivePanel('chat');
          createSession();
          setTimeout(() => sendMessage(`继续分析：\n${title}\n${url}\n\n之前摘要：${summary}`), 200);
        } catch {}
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <Header viewMode={viewMode} onViewModeChange={setViewMode} />

      {activePanel === 'tabs' && (
        <>
          <FilterBar viewMode={viewMode} onViewModeChange={setViewMode} />
          {viewMode === 'list' && <TabList />}
          {viewMode === 'grouped' && <GroupedView />}
          {viewMode === 'duplicates' && <DuplicateGroupView />}
          <BatchBar />
        </>
      )}

      {activePanel === 'chat' && <ChatPanel />}

      {showSettings && <SettingsOverlay />}
      {noteTab && <NoteDialog tab={noteTab} onClose={() => setNoteTab(null)} />}
      <Toast />
    </div>
  );
}
