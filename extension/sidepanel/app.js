import {
  getAllTabs, extractAllContent, closeTab, closeTabs, focusTab,
  syncToBackend, backendGet, backendPost, backendPatch, backendDelete,
  snapshotTab, getCurrentActiveTab,
} from '../lib/api-client.js';
import {
  state, $, $$, esc, toast, toggleModal,
  showLoading, hideLoading, showEmpty,
  showProgress, hideProgress, getModel,
  removeTabFromState, FACET_DEFS,
} from './modules/state.js';
import { renderTabs, updateBatchBar, updateBudgetDisplay, updateCounts, populateCategoryFilter } from './modules/render.js';
import { batchSummarize } from './modules/summary.js';
import {
  createNewFolder, confirmFolderPick,
  batchBookmarkWithPicker, openBookmarkManager,
} from './modules/bookmarks.js';
import { startWizard } from './modules/wizard.js';
import { buildDuplicateReport, applyDuplicateBadges } from './modules/duplicate-utils.js';
import { categorizeTabs, refreshDuplicateIndicators, updateFacetChipCounts, applyCategoryResult } from './modules/categorize.js';
import { openSnooze, snoozeBy, snoozeCustom, checkSnoozedTabs } from './modules/snooze.js';
import { saveSession, viewSessions, viewSnapshots, viewApiLogs } from './modules/sessions.js';
import { viewGraph } from './modules/graph.js';
import { viewResearch, viewWeeklyReport, runAnalysis } from './modules/research.js';

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
  listenTabChanges();
  await checkBackend();
  await scanTabs();
});

// ─── Passive Tab Awareness ───
function refreshOpenModals() {
  const dupModal = document.getElementById('duplicatesModal');
  if (dupModal && dupModal.style.display !== 'none') {
    findDuplicates();
  }
}

function listenTabChanges() {
  chrome.runtime.onMessage.addListener((message) => {
    if (!state.tabs.length && message.type !== 'TAB_CREATED') return;

    if (message.type === 'TAB_REMOVED') {
      const tabId = `tab-${message.chromeTabId}`;
      const existed = state.tabs.some(t => t.id === tabId);
      if (existed) {
        removeTabFromState(tabId);
        refreshDuplicateIndicators();
        renderTabs();
        updateCounts();
        updateFacetChipCounts();
        refreshOpenModals();
      }
    } else if (message.type === 'TAB_UPDATED') {
      const tabId = `tab-${message.chromeTabId}`;
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab) {
        if (message.title) tab.title = message.title;
        if (message.url) {
          tab.url = message.url;
          try { tab.domain = new URL(message.url).hostname.replace(/^www\./, ''); } catch {}
        }
        if (message.favIconUrl) tab.faviconUrl = message.favIconUrl;
        tab.discarded = message.discarded ?? tab.discarded;
        refreshDuplicateIndicators();
        renderTabs();
        updateFacetChipCounts();
        refreshOpenModals();
      }
    } else if (message.type === 'TAB_CREATED') {
      if (message.url && !message.url.startsWith('chrome://') && !message.url.startsWith('chrome-extension://')) {
        const newId = `tab-${message.chromeTabId}`;
        if (!state.tabs.some(t => t.id === newId)) {
          let domain = 'unknown';
          try { domain = new URL(message.url).hostname.replace(/^www\./, ''); } catch {}
          const newTab = {
            id: newId,
            chromeTabId: message.chromeTabId,
            url: message.url,
            title: message.title || '',
            domain,
            faviconUrl: message.favIconUrl || '',
            windowId: message.windowId,
            index: message.index,
            facets: [],
            _isNew: true,
          };
          state.tabs.push(newTab);
          const targetCat = state.categories.find(c => c.id === domain) || state.categories.find(c => c.id === 'uncategorized');
          if (targetCat) targetCat.tabs.push(newTab);
          else state.categories.push({ id: domain, name: domain, icon: '🌐', color: '#6B7280', tabs: [newTab], tab_count: 1 });
          updateBudgetDisplay();
          refreshDuplicateIndicators();
          renderTabs();
          updateFacetChipCounts();
          refreshOpenModals();
        }
      }
    }
  });
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(['settings']);
  if (stored.settings) Object.assign(state.settings, stored.settings);
  $('#settingBudget').value = state.settings.budget;
  $('#settingBackendUrl').value = state.settings.backendUrl;
  $('#settingTheme').value = state.settings.theme || 'auto';
  $('#tabBudgetMax').textContent = state.settings.budget;
  applyTheme(state.settings.theme || 'auto');
}

async function saveSettings() {
  state.settings.budget = parseInt($('#settingBudget').value) || 100;
  state.settings.backendUrl = $('#settingBackendUrl').value || 'http://127.0.0.1:3456';
  state.settings.theme = $('#settingTheme').value || 'auto';
  await chrome.storage.local.set({ settings: state.settings });
  $('#tabBudgetMax').textContent = state.settings.budget;
  applyTheme(state.settings.theme);
  toast('设置已保存');
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else if (theme === 'light') root.setAttribute('data-theme', 'light');
}

// ─── Events ───
function bindEvents() {
  $('#btnScan').addEventListener('click', scanTabs);
  $('#btnCategorize').addEventListener('click', () => categorizeWithChoice());
  $('#btnWizard').addEventListener('click', startWizard);
  $('#btnDuplicates').addEventListener('click', findDuplicates);
  $('#btnExport').addEventListener('click', () => {
    $('#exportResult').style.display = 'none';
    toggleModal('exportModal', true);
  });
  $('#btnSettings').addEventListener('click', () => toggleModal('settingsModal', true));
  $('#btnSaveSettings').addEventListener('click', saveSettings);
  $('#btnCopyExport').addEventListener('click', copyExport);
  $('#btnAnalysis').addEventListener('click', runAnalysis);
  $('#btnSaveSession').addEventListener('click', saveSession);
  $('#btnViewSessions').addEventListener('click', viewSessions);
  $('#btnViewSnapshots').addEventListener('click', viewSnapshots);
  $('#btnBookmarks').addEventListener('click', openBookmarkManager);
  $('#btnApiLogs').addEventListener('click', viewApiLogs);
  $('#btnGraph').addEventListener('click', viewGraph);
  $('#btnResearch').addEventListener('click', viewResearch);
  $('#btnWeekly').addEventListener('click', viewWeeklyReport);
  $('#btnSelectAll').addEventListener('click', toggleSelectAll);
  $('#btnBatchClose').addEventListener('click', batchClose);
  $('#btnBatchSnooze').addEventListener('click', () => openSnooze([...state.selectedIds]));
  $('#btnBatchBookmark').addEventListener('click', () => batchBookmarkWithPicker([...state.selectedIds]));
  $('#btnBatchSummarize').addEventListener('click', () => batchSummarize([...state.selectedIds]));
  $('#btnBatchCategorize').addEventListener('click', () => {
    const ids = [...state.selectedIds];
    if (!ids.length) return toast('请先勾选标签');
    categorizeTabs(ids);
  });
  $('#btnLocateCurrent').addEventListener('click', () => locateCurrentTab(true));

  $('#filterSort').addEventListener('change', renderTabs);
  $('#filterSearch').addEventListener('input', (e) => {
    state.filter.search = e.target.value.trim().toLowerCase();
    const clearBtn = $('#btnSearchClear');
    if (clearBtn) clearBtn.style.display = state.filter.search ? '' : 'none';
    renderTabs();
  });
  $('#btnSearchClear')?.addEventListener('click', () => {
    $('#filterSearch').value = '';
    state.filter.search = '';
    $('#btnSearchClear').style.display = 'none';
    renderTabs();
  });

  const logoEl = document.querySelector('.logo');
  if (logoEl) {
    logoEl.style.cursor = 'pointer';
    logoEl.addEventListener('dblclick', () => {
      $('#tabList')?.scrollTo({ top: 0, behavior: 'smooth' });
      toast('已回到顶部');
    });
  }
  $$('.facet-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.facet;
      state.filter.facet = state.filter.facet === val ? null : val;
      $$('.facet-chip').forEach(c => c.classList.toggle('active', c.dataset.facet === state.filter.facet));
      renderTabs();
    });
  });
  $('#filterCategory').addEventListener('change', () => {
    state.filter.category = $('#filterCategory').value || null;
    renderTabs();
  });

  $$('.export-option').forEach(btn => btn.addEventListener('click', () => doExport(btn.dataset.format)));
  $$('.snooze-option').forEach(btn => btn.addEventListener('click', () => snoozeBy(parseInt(btn.dataset.minutes))));
  $('#btnSnoozeCustom').addEventListener('click', snoozeCustom);

  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) { toggleModal(closeBtn.dataset.close, false); return; }
    if (e.target.classList.contains('modal')) toggleModal(e.target.id, false);
  });
}

// ─── Backend ───
async function checkBackend() {
  const result = await backendGet('/api/health');
  state.backendConnected = !result.error;
  const el = $('#backendStatus');
  if (state.backendConnected) {
    el.className = 'status-bar status-connected';
    el.querySelector('.status-text').textContent = `已连接 · ${result.aiProvider || ''}`;
    await loadModels();
  } else {
    el.className = 'status-bar status-disconnected';
    el.querySelector('.status-text').textContent = '后端未连接';
  }
}

async function loadModels() {
  const result = await backendGet('/api/tabs/models');
  if (result.models) {
    const sel = $('#modelSelector select');
    if (sel) {
      sel.innerHTML = result.models.map(m => {
        const val = typeof m === 'string' ? m : m.model || m.label;
        const label = typeof m === 'string' ? m : m.label || m.model;
        return `<option value="${val}"${m.isDefault ? ' selected' : ''}>${label}</option>`;
      }).join('');
    }
    $('#modelSelector').style.display = result.models.length > 1 ? 'flex' : 'none';
    sel.addEventListener('change', () => { state.selectedModel = sel.value; });
    const defaultModel = result.models.find(m => m.isDefault);
    if (defaultModel) state.selectedModel = typeof defaultModel === 'string' ? defaultModel : defaultModel.model;
  }
}

// ─── Scan ───
async function scanTabs() {
  showLoading('正在扫描标签...');
  const result = await getAllTabs();
  if (result.error) { showEmpty('扫描失败: ' + result.error); return; }

  state.tabs = (result.tabs || []).filter(t =>
    t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://')
  );

  for (const tab of state.tabs) {
    try { tab.domain = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { tab.domain = 'unknown'; }
  }

  updateBudgetDisplay();
  if (state.tabs.length === 0) { showEmpty('没有找到标签页'); return; }

  if (state.backendConnected) {
    showLoading(`正在同步 ${state.tabs.length} 个标签...`);
    await syncToBackend(state.tabs);
  }

  if (state.backendConnected) {
    const backendTabs = await backendGet('/api/tabs');
    if (backendTabs.tabs) {
      const backendMap = {};
      for (const bt of backendTabs.tabs) backendMap[bt.id] = bt;
      for (const tab of state.tabs) {
        const bt = backendMap[tab.id];
        if (bt) {
          tab.topic_id = bt.topic_id;
          tab.category_id = bt.category_id;
          tab.facets = bt.facets || [];
          tab.first_seen_at = bt.first_seen_at;
          tab.summary = bt.summary;
          tab.ai_recommendation = bt.ai_recommendation;
          tab.freshness_score = bt.freshness_score;
          tab.duplicate_cluster_id = bt.duplicate_cluster_id;
          tab.user_decision = bt.user_decision;
          tab.stale_days = bt.stale_days;
          tab.is_frozen = bt.is_frozen;
        }
        tab._isNew = !bt?.topic_id;
      }
    }
  }

  await checkSnoozedTabs();
  groupTabsByDomain();
  refreshDuplicateIndicators();
  updateFacetChipCounts();
  populateCategoryFilter();
  hideLoading();
  $('#filterBar').style.display = '';
  $('#btnCategorize').disabled = !state.backendConnected;
  $('#btnWizard').disabled = !state.backendConnected;
  $('#btnDuplicates').disabled = false;
  $('#btnExport').disabled = !state.backendConnected;
  $('#btnAnalysis').disabled = !state.backendConnected;
  $('#btnGraph').disabled = !state.backendConnected;
  $('#btnResearch').disabled = !state.backendConnected;
  $('#btnWeekly').disabled = !state.backendConnected;
  $('#btnSaveSession').disabled = false;
  renderTabs();
}

function groupTabsByDomain() {
  const grouped = {};
  for (const tab of state.tabs) {
    const key = tab.domain || 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tab);
  }
  state.categories = Object.keys(grouped).map(d => ({
    id: d, name: d, icon: '🌐', color: '#6B7280', tabs: grouped[d], tab_count: grouped[d].length,
  }));
  state.categories.sort((a, b) => b.tab_count - a.tab_count);
}

// ─── Locate Current Tab ───
async function locateCurrentTab(allowRescan = false) {
  let chromeTab;
  try {
    const result = await getCurrentActiveTab();
    if (result?.tab) {
      chromeTab = result.tab;
    }
  } catch {}

  if (!chromeTab) {
    const [fallback] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    chromeTab = fallback;
  }
  if (!chromeTab) { toast('无法获取当前标签'); return; }
  const chromeTabId = chromeTab.id;

  let target = state.tabs.find(t => t.chromeTabId === chromeTabId)
    || state.tabs.find(t => t.id === `tab-${chromeTabId}`)
    || state.tabs.find(t => t.url === chromeTab.url);
  if (!target && allowRescan) {
    toast('正在重新扫描...');
    await scanTabs();
    target = state.tabs.find(t => t.chromeTabId === chromeTabId)
      || state.tabs.find(t => t.id === `tab-${chromeTabId}`)
      || state.tabs.find(t => t.url === chromeTab.url);
  }
  if (!target) {
    toast('未在侧栏列表中找到当前标签');
    return;
  }

  state.filter.facets = new Set();
  state.filter.category = 'all';
  state.filter.search = '';
  $$('.facet-chip').forEach(c => c.classList.remove('active'));
  $('#filterCategory').value = 'all';
  $('#filterSearch').value = '';
  renderTabs();

  setTimeout(() => {
    const el = document.querySelector(`.tab-item[data-id="${target.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-pulse');
      setTimeout(() => el.classList.remove('highlight-pulse'), 2000);
    }
  }, 100);
  toast(`已定位: ${(target.title || target.url || '').slice(0, 36)}`);
}

// ─── Duplicates ───
function findDuplicates() {
  const { exactGroups: exactDups, similarGroups: titleDups } = buildDuplicateReport(state.tabs);

  const body = $('#duplicatesBody');
  if (exactDups.length === 0 && titleDups.length === 0) {
    body.innerHTML = '<div class="state-panel"><p>没有发现重复标签</p></div>';
    toggleModal('duplicatesModal', true);
    return;
  }

  let html = '';
  const renderGroup = (group, label) => {
    html += `<div class="dup-group"><div class="dup-group-title">${label}</div>`;
    for (const tab of group) {
      html += `<div class="dup-item">
        <a href="#" data-focus="${tab.chromeTabId}" title="${esc(tab.url)}">${esc(tab.title || tab.url)}</a>
        <button class="dup-close-btn" data-closetab="${tab.chromeTabId}" data-tabid="${tab.id}">关闭</button>
      </div>`;
    }
    html += '</div>';
  };

  if (exactDups.length > 0) {
    html += `<h4 style="margin-bottom:8px;font-size:13px;font-weight:600">完全重复 (${exactDups.length} 组)</h4>`;
    for (const g of exactDups) renderGroup(g, `🔴 ${g.length} 个相同 URL`);
  }
  if (titleDups.length > 0) {
    html += `<h4 style="margin:10px 0 8px;font-size:13px;font-weight:600">疑似重复 (${titleDups.length} 组)</h4>`;
    for (const g of titleDups) renderGroup(g, `🟡 相似标题 · ${g[0].domain}`);
  }

  body.innerHTML = html;
  body.querySelectorAll('[data-focus]').forEach(a => {
    a.addEventListener('click', (e) => { e.preventDefault(); focusTab(parseInt(a.dataset.focus)); });
  });
  body.querySelectorAll('.dup-close-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await closeTab(parseInt(btn.dataset.closetab));
      if (state.backendConnected) await backendPatch(`/api/tabs/${btn.dataset.tabid}/status`, { status: 'closed' });
      removeTabFromState(btn.dataset.tabid);
      btn.closest('.dup-item').remove();
      updateCounts();
      refreshDuplicateIndicators();
      renderTabs();
    });
  });
  toggleModal('duplicatesModal', true);
  applyDuplicateBadges(state.tabs, exactDups, titleDups);
  renderTabs();
}

// ─── Categorize Choice ───
function categorizeWithChoice() {
  const selectedIds = [...state.selectedIds];
  const newIds = state.tabs.filter(t => t._isNew).map(t => t.id);

  if (selectedIds.length === 0 && newIds.length === 0) {
    categorizeTabs();
    return;
  }

  const popup = document.createElement('div');
  popup.className = 'choice-popup';
  popup.innerHTML = `
    <div class="choice-popup-content">
      <div class="choice-title">选择分类范围</div>
      <button class="btn btn-sm btn-primary choice-btn" data-action="all">
        全部分类 (${state.tabs.length})
      </button>
      ${newIds.length > 0 ? `<button class="btn btn-sm btn-accent choice-btn" data-action="new">
        仅未处理 (${newIds.length})
      </button>` : ''}
      ${selectedIds.length > 0 ? `<button class="btn btn-sm btn-ghost choice-btn" data-action="selected">
        仅已选 (${selectedIds.length})
      </button>` : ''}
      <button class="btn btn-sm choice-btn" data-action="cancel">取消</button>
    </div>
  `;
  document.body.appendChild(popup);

  popup.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    popup.remove();
    if (action === 'all') categorizeTabs();
    else if (action === 'new') categorizeTabs(newIds);
    else if (action === 'selected') categorizeTabs(selectedIds);
  });

  setTimeout(() => {
    const handler = (e) => {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', handler); }
    };
    document.addEventListener('click', handler);
  }, 50);
}

// ─── Batch / Export / Select ───
function toggleSelectAll() {
  const allIds = state.tabs.map(t => t.id);
  const all = allIds.every(id => state.selectedIds.has(id));
  if (all) state.selectedIds.clear(); else allIds.forEach(id => state.selectedIds.add(id));
  $$('.tab-checkbox').forEach(cb => { cb.checked = !all; });
  $$('.tab-item').forEach(el => { el.classList.toggle('selected', !all); });
  $$('.cat-checkbox').forEach(cb => { cb.checked = !all; });
  updateBatchBar();
}

async function batchClose() {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  const chromeTabs = state.tabs.filter(t => ids.includes(t.id) && t.chromeTabId);
  if (chromeTabs.length) await closeTabs(chromeTabs.map(t => t.chromeTabId));
  if (state.backendConnected) await backendPost('/api/tabs/close-batch', { tabIds: ids });
  for (const id of ids) removeTabFromState(id);
  state.selectedIds.clear();
  renderTabs();
  updateCounts();
  toast(`已关闭 ${ids.length} 个标签`);
}

async function doExport(format) {
  if (!state.backendConnected) return toast('需要后端连接');
  const eps = { json: '/api/export/json', markdown: '/api/export/markdown', notes: '/api/export/notes' };
  const result = await backendGet(eps[format]);
  let content;
  if (format === 'json') content = JSON.stringify(result, null, 2);
  else if (format === 'markdown') content = result.text || JSON.stringify(result, null, 2);
  else content = result.combined || JSON.stringify(result, null, 2);
  $('#exportResult').style.display = '';
  $('#exportContent').value = content;
}

async function copyExport() {
  try { await navigator.clipboard.writeText($('#exportContent').value); toast('已复制到剪贴板'); }
  catch { $('#exportContent').select(); document.execCommand('copy'); toast('已复制'); }
}
