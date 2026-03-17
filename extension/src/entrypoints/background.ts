import { MESSAGE_TYPES } from '@/lib/types';

export default defineBackground(() => {
  console.log('[MindShelf] Background service worker started');

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case MESSAGE_TYPES.SCAN_TABS:
        handleScanTabs().then(sendResponse);
        return true;

      case MESSAGE_TYPES.ACTIVATE_TAB:
        handleActivateTab(message.tabId, message.windowId).then(sendResponse);
        return true;

      case MESSAGE_TYPES.CLOSE_TAB:
        handleCloseTab(message.tabId).then(sendResponse);
        return true;

      case MESSAGE_TYPES.GET_ACTIVE_TAB:
        handleGetActiveTab().then(sendResponse);
        return true;

      case MESSAGE_TYPES.EXTRACT_CONTENT:
        handleExtractContent(message.tabId).then(sendResponse);
        return true;

      case 'EXTRACT_HTML':
        handleExtractHTML(message.tabId).then(sendResponse);
        return true;

      // GET_BOOKMARKS removed — maintaining tool focus
    }
  });

  chrome.tabs.onCreated.addListener((tab) => {
    broadcastToSidePanel({ type: MESSAGE_TYPES.TAB_CREATED, tabId: tab.id });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    broadcastToSidePanel({ type: MESSAGE_TYPES.TAB_REMOVED, tabId });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.title) {
      broadcastToSidePanel({
        type: MESSAGE_TYPES.TAB_UPDATED,
        tabId,
        changes: changeInfo,
      });
    }
  });
});

async function handleScanTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))
    .map((t) => ({
      tabId: t.id,
      windowId: t.windowId,
      url: t.url,
      title: t.title || 'Untitled',
      favIconUrl: t.favIconUrl,
      active: t.active,
      pinned: t.pinned,
      discarded: t.discarded || false,
      lastAccessed: t.lastAccessed,
    }));
}

async function handleActivateTab(tabId: number, windowId?: number) {
  try {
    if (windowId) {
      await chrome.windows.update(windowId, { focused: true });
    }
    await chrome.tabs.update(tabId, { active: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleCloseTab(tabId: number) {
  try {
    await chrome.tabs.remove(tabId);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleGetActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function handleExtractContent(tabId: number) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const body = document.body.innerText;
        return {
          content_text: body.slice(0, 15000),
          title: document.title,
          url: window.location.href,
        };
      },
    });

    return results[0]?.result || null;
  } catch (err) {
    return { error: (err as Error).message };
  }
}


async function handleExtractHTML(tabId: number) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        html: document.documentElement.outerHTML,
        url: window.location.href,
        title: document.title,
      }),
    });
    return results[0]?.result || null;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

function broadcastToSidePanel(message: unknown) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open
  });
}
