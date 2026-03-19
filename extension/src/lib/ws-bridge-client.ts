/**
 * WebSocket Bridge Client for MindShelf Chrome Extension.
 * Connects to the backend's WebSocket hub and handles incoming
 * MCP requests by dispatching to local chrome.tabs/storage APIs.
 * Only connects after confirming backend is reachable via health check.
 */

const BACKEND_URL = 'http://localhost:3456';
const WS_URL = 'ws://localhost:3456/ws/bridge';
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;
const KEEPALIVE_ALARM = 'ws-keepalive';

let ws: WebSocket | null = null;
let reconnectDelay = RECONNECT_BASE_MS;
let intentionalClose = false;
let backendReachable = false;

export function startBridgeClient() {
  tryConnect();
  setupKeepalive();
}

async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BACKEND_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const data = await res.json();
    return data?.name === 'MindShelf Backend';
  } catch {
    return false;
  }
}

async function tryConnect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  backendReachable = await checkBackendHealth();
  if (!backendReachable) {
    scheduleReconnect();
    return;
  }

  connect();
}

function connect() {
  intentionalClose = false;

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[Bridge] Connected to backend');
    reconnectDelay = RECONNECT_BASE_MS;
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      if (!msg.id || !msg.method) return;
      try {
        const result = await dispatch(msg.method, msg.params || {});
        ws?.send(JSON.stringify({ id: msg.id, result }));
      } catch (err) {
        ws?.send(JSON.stringify({ id: msg.id, error: (err as Error).message }));
      }
    } catch {}
  };

  ws.onclose = () => {
    ws = null;
    if (!intentionalClose) scheduleReconnect();
  };

  ws.onerror = () => {};
}

function scheduleReconnect() {
  const jitter = Math.random() * 1000;
  setTimeout(tryConnect, reconnectDelay + jitter);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function setupKeepalive() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== KEEPALIVE_ALARM) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) tryConnect();
  });
}

async function dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case 'list_tabs': return handleListTabs();
    case 'search_tabs': return handleSearchTabs(params);
    case 'get_tab_detail': return handleGetTabDetail(params);
    case 'close_tabs': return handleCloseTabs(params);
    case 'categorize_tabs': return handleCategorizeTabs(params);
    case 'detect_duplicates': return handleDetectDuplicates();
    case 'get_page_content': return handleGetPageContent();
    case 'summarize_tab': return handleSummarizeTab(params);
    case 'get_tab_export_data': return handleGetTabExportData(params);
    default: throw new Error(`Unknown bridge method: ${method}`);
  }
}

async function getStoredTabs(): Promise<any[]> {
  const data = await chrome.storage.local.get('tabs');
  return data.tabs || [];
}

async function handleListTabs() {
  const tabs = await getStoredTabs();
  return tabs.map((t: any) => ({
    id: t.id,
    tabId: t.tabId,
    title: t.title,
    url: t.url,
    domain: t.domain,
    topic: t.topic,
    tags: t.tags,
    aiSummary: t.aiSummary,
    userScore: t.userScore,
    lastAccessed: t.lastAccessed,
  }));
}

async function handleSearchTabs(params: Record<string, unknown>) {
  const tabs = await getStoredTabs();
  const query = (params.query as string || '').toLowerCase();
  const domain = (params.domain as string || '').toLowerCase();
  const topic = (params.topic as string || '').toLowerCase();
  const keywords = query.split(/[\s,]+/).filter(Boolean);

  return tabs.filter((t: any) => {
    const text = `${t.title || ''} ${t.url || ''} ${t.domain || ''} ${t.topic || ''} ${t.aiSummary || ''} ${(t.tags || []).join(' ')}`.toLowerCase();
    const matchesKeywords = !keywords.length || keywords.some((kw: string) => text.includes(kw));
    const matchesDomain = !domain || (t.domain || '').toLowerCase().includes(domain);
    const matchesTopic = !topic || (t.topic || '').toLowerCase().includes(topic);
    return matchesKeywords && matchesDomain && matchesTopic;
  });
}

async function handleGetTabDetail(params: Record<string, unknown>) {
  const tabs = await getStoredTabs();
  const tab = tabs.find((t: any) => String(t.id) === String(params.tabId));
  return tab || null;
}

async function handleCloseTabs(params: Record<string, unknown>) {
  const tabIds = params.tabIds as string[];
  const tabs = await getStoredTabs();
  const results: { id: string; closed: boolean; error?: string }[] = [];

  for (const id of tabIds) {
    const tab = tabs.find((t: any) => String(t.id) === String(id));
    if (!tab || !tab.tabId) {
      results.push({ id, closed: false, error: 'Tab not found' });
      continue;
    }
    try {
      await chrome.tabs.remove(tab.tabId);
      results.push({ id, closed: true });
    } catch (err) {
      results.push({ id, closed: false, error: (err as Error).message });
    }
  }
  return results;
}

async function handleCategorizeTabs(_params: Record<string, unknown>) {
  return { status: 'dispatched', message: 'Classification must be triggered from the side panel UI' };
}

async function handleDetectDuplicates() {
  const tabs = await getStoredTabs();
  const urlMap = new Map<string, any[]>();
  for (const tab of tabs) {
    const key = tab.url?.replace(/\/$/, '').replace(/^https?:\/\//, '') || '';
    if (!urlMap.has(key)) urlMap.set(key, []);
    urlMap.get(key)!.push(tab);
  }
  const groups = [...urlMap.values()].filter((g) => g.length > 1);
  return {
    totalDuplicateGroups: groups.length,
    totalDuplicateTabs: groups.reduce((sum, g) => sum + g.length - 1, 0),
    groups: groups.map((g) => ({
      url: g[0].url,
      tabs: g.map((t: any) => ({ id: t.id, tabId: t.tabId, title: t.title })),
    })),
  };
}

async function handleGetPageContent() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) throw new Error('No active tab');
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => ({ content_text: document.body.innerText.slice(0, 15000), title: document.title, url: window.location.href }),
    });
    return results[0]?.result || null;
  } catch (err) {
    throw new Error(`Cannot extract content: ${(err as Error).message}`);
  }
}

async function handleSummarizeTab(_params: Record<string, unknown>) {
  return { status: 'dispatched', message: 'Summarization must be triggered from the side panel UI' };
}

async function handleGetTabExportData(params: Record<string, unknown>) {
  const tabs = await getStoredTabs();
  const tab = tabs.find((t: any) => String(t.id) === String(params.tabId));
  if (!tab) return null;
  return {
    title: tab.title,
    url: tab.url,
    domain: tab.domain,
    topic: tab.topic,
    tags: tab.tags,
    userScore: tab.userScore,
    content: tab.aiSummary || tab.contentExcerpt || '',
  };
}
