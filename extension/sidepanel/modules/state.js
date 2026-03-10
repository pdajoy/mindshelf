export const FACET_DEFS = {
  new:        { label: '未处理', icon: '🆕', color: '#34C759' },
  duplicate:  { label: '重复', icon: '🔴', color: 'var(--c-danger)' },
  similar:    { label: '相似', icon: '🟡', color: 'var(--c-warning)' },
  outdated:   { label: '过时', icon: '📅', color: 'var(--c-text3)' },
  frozen:     { label: '冻结', icon: '❄️', color: '#5AC8FA' },
  snoozed:    { label: '稍后读', icon: '⏰', color: '#AF52DE' },
  high_value: { label: '高价值', icon: '⭐', color: '#FF9500' },
};

// Lightweight reactive state with change subscriptions
const _listeners = new Map();

function createReactiveState(initial) {
  const handler = {
    set(target, prop, value) {
      const old = target[prop];
      target[prop] = value;
      if (old !== value) {
        const fns = _listeners.get(prop);
        if (fns) for (const fn of fns) try { fn(value, old, prop); } catch {}
      }
      return true;
    },
  };
  return new Proxy(initial, handler);
}

export const state = createReactiveState({
  tabs: [],
  categories: [],
  facetStats: {},
  selectedIds: new Set(),
  backendConnected: false,
  filter: { category: 'all', sort: 'category', search: '', facets: new Set() },
  snoozeTargetIds: [],
  settings: { budget: 100, backendUrl: 'http://127.0.0.1:3456', theme: 'auto' },
  models: [],
  selectedModel: null,
  folderPickerCallback: null,
  selectedFolderId: null,
  wizardDecisions: {},
});

export function onStateChange(key, fn) {
  if (!_listeners.has(key)) _listeners.set(key, new Set());
  _listeners.get(key).add(fn);
  return () => _listeners.get(key)?.delete(fn);
}

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

export function toggleModal(id, show) {
  $(`#${id}`).style.display = show ? '' : 'none';
  if (!show && id === 'exportModal') $('#exportResult').style.display = 'none';
}

export function showLoading(text) {
  $('#emptyState').style.display = 'none';
  $('#tabList').style.display = 'none';
  $('#loadingState').style.display = '';
  $('#loadingText').textContent = text;
}

export function hideLoading() { $('#loadingState').style.display = 'none'; }

export function showEmpty(msg) {
  $('#loadingState').style.display = 'none';
  $('#tabList').style.display = 'none';
  $('#emptyState').style.display = '';
  $('#emptyState').querySelector('p').textContent = msg;
}

export function showProgress(pct, text) {
  const container = $('#progressContainer');
  container.classList.add('active');
  $('#progressFill').style.width = pct + '%';
  $('#progressText').textContent = text || '';
}

export function hideProgress() {
  $('#progressContainer').classList.remove('active');
  $('#progressFill').style.width = '0%';
  $('#progressText').textContent = '';
}

export function getModel() {
  return state.selectedModel || undefined;
}

export function getAgeText(dateStr) {
  if (!dateStr) return null;
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 1) return { text: '今天', cls: 'fresh' };
  if (days < 3) return { text: `${days}天`, cls: 'fresh' };
  if (days < 7) return { text: `${days}天`, cls: 'aging' };
  if (days < 30) return { text: `${Math.floor(days / 7)}周`, cls: 'aging' };
  return { text: `${Math.floor(days / 30)}月`, cls: 'old' };
}

export function getAgeDays(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function formatSnoozeTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = d - now;
  if (diff < 0) return '已到期';
  if (diff < 3600000) return `${Math.ceil(diff / 60000)}分钟后`;
  if (diff < 86400000) return `${Math.ceil(diff / 3600000)}小时后`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function removeTabFromState(tabId) {
  state.tabs = state.tabs.filter(t => t.id !== tabId);
  state.selectedIds.delete(tabId);
  for (const cat of state.categories) cat.tabs = cat.tabs.filter(t => t.id !== tabId);
  state.categories = state.categories.filter(c => c.tabs.length > 0);
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url;
  }
}
