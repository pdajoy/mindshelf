const BACKEND_URL = 'http://127.0.0.1:3456';

async function getBackendUrl() {
  try {
    const stored = await chrome.storage.local.get(['settings']);
    return stored?.settings?.backendUrl || BACKEND_URL;
  } catch {
    return BACKEND_URL;
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

// ─── Passive Tab Awareness ───
chrome.tabs.onRemoved.addListener((tabId, _removeInfo) => {
  notifySidePanel({ type: 'TAB_REMOVED', chromeTabId: tabId });
  markTabClosedOnBackend(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) {
    notifySidePanel({
      type: 'TAB_UPDATED',
      chromeTabId: tabId,
      url: tab.url,
      title: tab.title,
      status: tab.status,
      discarded: tab.discarded || false,
      autoDiscardable: tab.autoDiscardable,
      favIconUrl: tab.favIconUrl,
    });
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  notifySidePanel({
    type: 'TAB_CREATED',
    chromeTabId: tab.id,
    url: tab.pendingUrl || tab.url || '',
    title: tab.title || '',
    windowId: tab.windowId,
    index: tab.index,
    favIconUrl: tab.favIconUrl || '',
  });
});

function notifySidePanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function markTabClosedOnBackend(chromeTabId) {
  try {
    const backendUrl = await getBackendUrl();
    await fetch(`${backendUrl}/api/tabs/mark-closed-by-chrome-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chromeTabId }),
    });
  } catch {}
}

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// ─── Weekly Report Alarm ───
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('weekly-report', { periodInMinutes: 7 * 24 * 60 });
});

// ─── Snooze Alarm Handler ───
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'weekly-report') {
    try {
      const backendUrl = await getBackendUrl();
      const resp = await fetch(`${backendUrl}/api/tabs/weekly-report`);
      if (resp.ok) {
        const report = await resp.json();
        await chrome.notifications.create('weekly-report-' + Date.now(), {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: '📊 Tab Helper 周报',
          message: `本周新增 ${report.newTabs} · 清理 ${report.closedTabs} · 活跃 ${report.activeTabs}`,
          priority: 1,
        });
      }
    } catch {}
    return;
  }
  if (!alarm.name.startsWith('snooze-')) return;

  const stored = await chrome.storage.local.get(['snoozedTabs']);
  const map = stored.snoozedTabs || {};
  const now = Date.now();
  const toWake = [];

  for (const [id, info] of Object.entries(map)) {
    if (info.wakeAt <= now + 120000) {
      toWake.push(info);
      delete map[id];
    }
  }

  await chrome.storage.local.set({ snoozedTabs: map });

  if (toWake.length > 0) {
    const titles = toWake.map(t => t.title || t.url).slice(0, 3).join('\n');
    const extra = toWake.length > 3 ? `\n...还有 ${toWake.length - 3} 个` : '';

    try {
      await chrome.notifications.create(`snooze-${now}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `⏰ ${toWake.length} 个标签该看了`,
        message: titles + extra,
        priority: 2,
        requireInteraction: true,
      });
    } catch (e) {
      console.error('Notification failed:', e);
    }
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('snooze-')) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) await chrome.sidePanel.open({ windowId: tab.windowId });
      chrome.notifications.clear(notificationId);
    } catch {}
  }
});

// ─── Message Router ───
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    GET_ALL_TABS: () => handleGetAllTabs(),
    EXTRACT_CONTENT: () => handleExtractContent(message.tabId),
    EXTRACT_ALL_CONTENT: () => handleExtractAllContent(message.tabIds),
    CLOSE_TAB: () => chrome.tabs.remove(message.tabId).then(() => ({ ok: true })).catch(e => ({ error: e.message })),
    CLOSE_TABS: () => chrome.tabs.remove(message.tabIds).then(() => ({ ok: true })).catch(e => ({ error: e.message })),
    FOCUS_TAB: () => handleFocusTab(message.tabId),
    SYNC_TO_BACKEND: () => handleSyncToBackend(message.tabs),
    BACKEND_REQUEST: () => handleBackendRequest(message.path, message.options),
    SNAPSHOT_TAB: () => handleSnapshot(message.tabId, message.options),
    GET_CURRENT_TAB: () => handleGetCurrentTab(),
    GET_BOOKMARK_FOLDERS: () => handleGetBookmarkFolders(),
    BOOKMARK_TO_FOLDER: () => handleBookmarkToFolder(message.folderId, message.title, message.url),
    CREATE_BOOKMARK_FOLDER: () => handleCreateBookmarkFolder(message.parentId, message.folderName),
    GET_BOOKMARK_CHILDREN: () => handleGetBookmarkChildren(message.folderId),
    DELETE_BOOKMARK: () => handleDeleteBookmark(message.bookmarkId),
  };

  const handler = handlers[message.type];
  if (handler) {
    handler().then(sendResponse);
    return true;
  }
});

async function handleFocusTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleGetAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return {
      tabs: tabs.map(t => ({
        chromeTabId: t.id,
        id: `tab-${t.id}`,
        url: t.url || '',
        title: t.title || '',
        faviconUrl: t.favIconUrl || '',
        windowId: t.windowId,
        index: t.index,
        active: t.active,
        pinned: t.pinned,
        audible: t.audible,
        status: t.status,
        discarded: t.discarded || false,
        autoDiscardable: t.autoDiscardable ?? true,
        lastAccessed: t.lastAccessed || 0,
      })),
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function handleGetCurrentTab() {
  try {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { error: 'No active tab found' };
    return { tab: { id: tab.id, url: tab.url, title: tab.title, windowId: tab.windowId } };
  } catch (err) {
    return { error: err.message };
  }
}

async function handleExtractContent(tabId) {
  try {
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch { return { error: 'Tab not found' }; }

    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      return { content: tab.title || '', meta: {}, title: tab.title, url: tab.url };
    }

    await chrome.scripting.executeScript({ target: { tabId }, files: ['lib/Readability.js'] }).catch(() => {});
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContent,
    });
    return results[0]?.result || { error: 'No result' };
  } catch (err) {
    return { error: err.message };
  }
}

async function handleExtractAllContent(tabIds) {
  const results = {};
  const batchSize = 5;

  for (let i = 0; i < tabIds.length; i += batchSize) {
    const batch = tabIds.slice(i, i + batchSize);
    await Promise.all(batch.map(async (tabId) => {
      try {
        let tab;
        try { tab = await chrome.tabs.get(tabId); } catch { results[tabId] = { error: 'Tab not found' }; return; }

        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
          results[tabId] = { content: tab.title || '', meta: {}, title: tab.title, url: tab.url };
          return;
        }

        await chrome.scripting.executeScript({ target: { tabId }, files: ['lib/Readability.js'] }).catch(() => {});
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractPageContent,
        });
        const extracted = result[0]?.result;
        if (extracted && extracted.content && extracted.content.length > 50) {
          results[tabId] = extracted;
        } else {
          results[tabId] = {
            content: `${tab.title || ''}\n${tab.url || ''}`,
            meta: { description: extracted?.meta?.description || '' },
            title: tab.title,
            url: tab.url,
          };
        }
      } catch (err) {
        try {
          const tab = await chrome.tabs.get(tabId);
          results[tabId] = {
            content: `${tab.title || ''}\n${tab.url || ''}`,
            meta: {},
            title: tab.title,
            url: tab.url,
          };
        } catch {
          results[tabId] = { error: err.message };
        }
      }
    }));
  }

  return results;
}

function extractPageContent() {
  let content = '';
  let readabilityUsed = false;

  if (typeof Readability !== 'undefined') {
    try {
      const clone = document.cloneNode(true);
      const article = new Readability(clone, { charThreshold: 50 }).parse();
      if (article && article.textContent && article.textContent.length > 100) {
        content = article.textContent;
        readabilityUsed = true;
      }
    } catch {}
  }

  if (!content || content.length < 200) {
    const selectors = [
      'article', '[role="main"]', 'main', '#readme',
      '.post-content', '.article-content', '.entry-content', '#content',
      '.markdown-body', '.post-body', '.content-body', '.story-body',
      '.blob-wrapper', '.rich-text', '#mw-content-text',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.length > 100) {
        const txt = el.innerText;
        if (txt.length > content.length) content = txt;
        break;
      }
    }
  }

  if (!content || content.length < 200) {
    const body = document.body?.innerText || '';
    if (body.length > (content?.length || 0)) content = body;
  }

  content = content.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().substring(0, 15000);

  const meta = {};
  const desc = document.querySelector('meta[name="description"]')
    || document.querySelector('meta[property="og:description"]');
  if (desc) meta.description = desc.content;
  const keywords = document.querySelector('meta[name="keywords"]');
  if (keywords) meta.keywords = keywords.content;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) meta.ogTitle = ogTitle.content;
  const published = document.querySelector('meta[property="article:published_time"]') ||
    document.querySelector('time[datetime]');
  if (published) meta.publishedDate = published.content || published.getAttribute('datetime');

  const h1 = document.querySelector('h1');
  if (h1) meta.h1 = h1.innerText.trim().substring(0, 200);
  meta.readability = readabilityUsed;

  if (content.length < 200 && meta.description) {
    content = `${meta.description}\n\n${content}`;
  }

  return { content, meta, title: document.title, url: location.href };
}

async function handleSnapshot(tabId, options = {}) {
  try {
    const backendUrl = await getBackendUrl();
    const tab = await chrome.tabs.get(tabId);
    const result = { url: tab.url, title: tab.title, domain: '' };
    try { result.domain = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}

    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    await new Promise(r => setTimeout(r, 500));

    try {
      const scripts = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const clone = document.cloneNode(true);
          clone.querySelectorAll('script, nav, footer, header, aside, .ad, [class*="cookie"], [class*="banner"]').forEach(el => el.remove());

          clone.querySelectorAll('img').forEach(img => {
            const lazySrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
            if (lazySrc) img.setAttribute('src', lazySrc);
            const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
            if (srcset) {
              const best = srcset.split(',').map(s => s.trim().split(/\s+/)[0]).pop();
              if (best && (!img.getAttribute('src') || img.getAttribute('src').includes('placeholder') || img.getAttribute('src').startsWith('data:')))
                img.setAttribute('src', best);
            }
            const rawSrc = img.getAttribute('src');
            if (rawSrc && !rawSrc.startsWith('data:') && !rawSrc.startsWith('http')) {
              try { img.setAttribute('src', new URL(rawSrc, document.baseURI).href); } catch {}
            }
            img.removeAttribute('data-src');
            img.removeAttribute('data-original');
            img.removeAttribute('data-lazy-src');
            img.removeAttribute('loading');
            img.removeAttribute('srcset');
            img.removeAttribute('data-srcset');
          });

          const main = clone.querySelector('article') || clone.querySelector('[role="main"]') || clone.querySelector('main') || clone.querySelector('body');
          return {
            html: main ? main.innerHTML : '',
            text: main ? main.innerText.substring(0, 50000) : '',
          };
        },
      });
      if (scripts[0]?.result) {
        result.htmlContent = scripts[0].result.html;
        result.textContent = scripts[0].result.text;
      }
    } catch (e) {
      console.warn('Snapshot content extraction failed:', e.message);
      result.textContent = `[Extraction failed — page may restrict extension access]\n\nTitle: ${tab.title}\nURL: ${tab.url}`;
    }

    if (options.screenshot !== false) {
      try {
        await new Promise(r => setTimeout(r, 300));
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png', quality: 80 });
        result.screenshot = dataUrl;
      } catch (e) {
        console.warn('Snapshot screenshot failed:', e.message);
      }
    }

    if (options.mhtml) {
      try {
        const blob = await chrome.pageCapture.saveAsMHTML({ tabId });
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        result.mhtml = base64;
      } catch (e) {
        console.warn('Snapshot MHTML failed:', e.message);
      }
    }

    const resp = await fetch(`${backendUrl}/api/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    return await resp.json();
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Bookmark Folder Operations ───
async function handleGetBookmarkFolders() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const folders = [];
    function walk(nodes, depth = 0) {
      for (const node of nodes) {
        if (!node.url) {
          folders.push({ id: node.id, title: node.title || '(根)', depth, parentId: node.parentId });
          if (node.children) walk(node.children, depth + 1);
        }
      }
    }
    walk(tree);
    return { folders };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleBookmarkToFolder(folderId, title, url) {
  try {
    const bm = await chrome.bookmarks.create({ parentId: folderId, title, url });
    return { ok: true, id: bm.id };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleCreateBookmarkFolder(parentId, folderName) {
  try {
    const folder = await chrome.bookmarks.create({ parentId: parentId || '1', title: folderName });
    return { ok: true, id: folder.id, title: folder.title };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleGetBookmarkChildren(folderId) {
  try {
    const children = await chrome.bookmarks.getChildren(folderId);
    return {
      items: children.map(c => ({
        id: c.id,
        title: c.title,
        url: c.url || null,
        isFolder: !c.url,
        dateAdded: c.dateAdded,
      })),
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleDeleteBookmark(bookmarkId) {
  try {
    await chrome.bookmarks.removeTree(bookmarkId);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleSyncToBackend(tabs) {
  try {
    const backendUrl = await getBackendUrl();
    const resp = await fetch(`${backendUrl}/api/tabs/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabs }),
    });
    return await resp.json();
  } catch (err) {
    return { error: `Backend unavailable: ${err.message}` };
  }
}

async function handleBackendRequest(path, options = {}) {
  try {
    const backendUrl = await getBackendUrl();
    const resp = await fetch(`${backendUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return await resp.json();
    return { text: await resp.text() };
  } catch (err) {
    return { error: `Backend unavailable: ${err.message}` };
  }
}
