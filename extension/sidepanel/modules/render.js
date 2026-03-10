import {
  closeTab, closeTabs, focusTab, backendPost, backendPatch, backendGet, backendDelete,
  snapshotTab, bookmarkToFolder,
} from '../../lib/api-client.js';
import {
  state, $, $$, esc, toast, toggleModal, getModel,
  getAgeText, getAgeDays, formatSnoozeTime, removeTabFromState, FACET_DEFS,
} from './state.js';
import { showTabSummaryChoice, showGroupSummary } from './summary.js';
import { openFolderPicker, bookmarkGroupWithPicker } from './bookmarks.js';
import { buildDuplicateReport, applyDuplicateBadges } from './duplicate-utils.js';

function tabHasFacets(tab) {
  return tab != null && Array.isArray(tab.facets) && tab.facets.length > 0;
}

function canonicalUrlForSort(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch { return url; }
}

export function renderTabs() {
  if (!tabHasFacets(state.tabs[0])) {
    const { exactGroups, similarGroups } = buildDuplicateReport(state.tabs);
    applyDuplicateBadges(state.tabs, exactGroups, similarGroups);
  }

  const container = $('#tabList');
  container.innerHTML = '';
  container.style.display = '';

  let groups = state.categories.map(g => ({ ...g, tabs: [...g.tabs] }));
  if (state.filter.category !== 'all') groups = groups.filter(g => g.id === state.filter.category);

  if (state.filter.facets.size > 0) {
    groups = groups.map(g => ({
      ...g,
      tabs: g.tabs.filter(t => {
        const tf = Array.isArray(t.facets) ? t.facets : [];
        for (const f of state.filter.facets) {
          if (f === 'new') { if (!t._isNew) return false; }
          else if (!tf.includes(f)) return false;
        }
        return true;
      }),
    })).filter(g => g.tabs.length > 0);
  }

  if (state.filter.search) {
    groups = groups.map(g => ({
      ...g,
      tabs: g.tabs.filter(t =>
        (t.title || '').toLowerCase().includes(state.filter.search) ||
        (t.url || '').toLowerCase().includes(state.filter.search) ||
        (t.domain || '').toLowerCase().includes(state.filter.search)
      ),
    })).filter(g => g.tabs.length > 0);
  }

  if (state.filter.sort === 'priority') {
    groups.forEach(g => g.tabs.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0)));
  } else if (state.filter.sort === 'title') {
    groups.forEach(g => g.tabs.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN')));
  } else if (state.filter.sort === 'age') {
    groups.forEach(g => g.tabs.sort((a, b) => getAgeDays(b.first_seen_at || b.lastAccessed) - getAgeDays(a.first_seen_at || a.lastAccessed)));
  } else if (state.filter.sort === 'domain') {
    groups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'));
    groups.forEach(g => g.tabs.sort((a, b) => (a.domain || '').localeCompare(b.domain || '', 'zh-Hans-CN') || (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN')));
  }

  // Within each group, cluster duplicates together
  groups.forEach(g => {
    const hasDups = g.tabs.some(t => t._dupCount || t.duplicate_cluster_id);
    if (hasDups) {
      const dupOrder = new Map();
      let idx = 0;
      for (const t of g.tabs) {
        const key = t.duplicate_cluster_id || (t._dupCount ? `_dup_${canonicalUrlForSort(t.url)}` : '');
        if (key && !dupOrder.has(key)) dupOrder.set(key, idx++);
      }
      g.tabs.sort((a, b) => {
        const aKey = a.duplicate_cluster_id || (a._dupCount ? `_dup_${canonicalUrlForSort(a.url)}` : '');
        const bKey = b.duplicate_cluster_id || (b._dupCount ? `_dup_${canonicalUrlForSort(b.url)}` : '');
        if (aKey && bKey) return (dupOrder.get(aKey) ?? 999) - (dupOrder.get(bKey) ?? 999);
        if (aKey) return -1;
        if (bKey) return 1;
        return 0;
      });
    }
  });

  if (groups.length === 0) {
    container.innerHTML = '<div class="state-panel"><p>没有匹配的标签</p></div>';
    return;
  }

  for (const group of groups) container.appendChild(createCategoryGroup(group));
  updateBatchBar();
}

function createCategoryGroup(group) {
  const div = document.createElement('div');
  div.className = 'category-group';

  const allSelected = group.tabs.every(t => state.selectedIds.has(t.id));

  const header = document.createElement('div');
  header.className = 'category-header';
  header.innerHTML = `
    <input type="checkbox" class="cat-checkbox" ${allSelected ? 'checked' : ''}>
    <span class="category-icon">${group.icon || '📁'}</span>
    <span class="category-name">${esc(group.name)}</span>
    <span class="category-count">${group.tabs.length}</span>
    <span class="category-actions">
      <button class="btn btn-sm btn-ghost cat-action" data-action="summarize" title="总结">📊</button>
      <button class="btn btn-sm btn-ghost cat-action" data-action="bookmark" title="全部收藏">⭐</button>
      <button class="btn btn-sm btn-ghost cat-action" data-action="close" title="全部关闭">✕</button>
    </span>
    <span class="category-chevron">▼</span>
  `;

  const body = document.createElement('div');
  body.className = 'category-body';
  for (const tab of group.tabs) body.appendChild(createTabItem(tab));

  const catCb = header.querySelector('.cat-checkbox');
  catCb.addEventListener('change', (e) => {
    e.stopPropagation();
    for (const tab of group.tabs) {
      if (e.target.checked) state.selectedIds.add(tab.id);
      else state.selectedIds.delete(tab.id);
    }
    body.querySelectorAll('.tab-checkbox').forEach(cb => { cb.checked = e.target.checked; });
    body.querySelectorAll('.tab-item').forEach(el => { el.classList.toggle('selected', e.target.checked); });
    updateBatchBar();
  });

  header.addEventListener('click', (e) => {
    if (e.target.closest('.category-actions') || e.target.closest('.cat-checkbox')) return;
    header.classList.toggle('collapsed');
    body.classList.toggle('collapsed');
  });

  header.querySelectorAll('.cat-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'summarize') showGroupSummary(group.id, group.name);
      else if (action === 'bookmark') bookmarkGroupWithPicker(group);
      else if (action === 'close') closeGroupTabs(group);
    });
  });

  div.appendChild(header);
  div.appendChild(body);
  return div;
}

function createTabItem(tab) {
  const div = document.createElement('div');
  const isSnoozed = tab._snoozed;
  const isDiscarded = tab.discarded;
  div.className = `tab-item${state.selectedIds.has(tab.id) ? ' selected' : ''}${isSnoozed ? ' snoozed' : ''}${isDiscarded ? ' discarded' : ''}`;
  div.dataset.id = tab.id;

  const ageInfo = getAgeText(tab.first_seen_at || tab.lastAccessed);
  const ageBadge = ageInfo ? `<span class="tab-age ${ageInfo.cls}">${ageInfo.text}</span>` : '';
  const snoozeBadge = isSnoozed ? `<span class="tab-age snoozed-badge">⏰ ${formatSnoozeTime(tab._snoozeUntil)}</span>` : '';

  const facets = Array.isArray(tab.facets) ? tab.facets : [];
  const newBadge = tab._isNew ? `<span class="facet-badge" style="--facet-color:#34C759">🆕 未处理</span>` : '';
  const facetBadges = facets.map(f => {
    const def = FACET_DEFS[f];
    if (!def) return '';
    return `<span class="facet-badge" style="--facet-color:${def.color}">${def.icon} ${def.label}</span>`;
  }).join('');
  const frozenBadge = (!facets.includes('frozen') && isDiscarded) ? `<span class="tab-age frozen">❄️ 冻结</span>` : '';
  const dupCount = tab._dupCount || 0;
  const similarCount = tab._similarCount || 0;
  const dupBadge = (!facets.includes('duplicate') && dupCount) ? `<span class="dup-badge dup-badge-clickable" data-dup-tab="${tab.id}">${dupCount} 重复</span>` : '';
  const dupFacetBadge = (facets.includes('duplicate') && dupCount) ? `<span class="dup-badge dup-badge-clickable" data-dup-tab="${tab.id}">${dupCount} 重复</span>` : '';
  const similarBadge = (!facets.includes('similar') && similarCount) ? `<span class="dup-badge dup-badge-clickable" style="background:var(--c-warning-light);color:#C93400" data-sim-tab="${tab.id}">${similarCount} 相似</span>` : '';
  const summaryPreview = tab.summary ? `<div class="tab-summary-preview">${esc(tab.summary)}</div>` : '';

  div.innerHTML = `
    <input type="checkbox" class="tab-checkbox" ${state.selectedIds.has(tab.id) ? 'checked' : ''}>
    <img class="tab-favicon" src="${tab.faviconUrl || tab.favicon_url || ''}" alt="">
    <div class="tab-info">
      <span class="tab-title" title="${esc(tab.title)}">${esc(tab.title || '无标题')}</span>
      <span class="tab-url">${esc(tab.domain || tab.url)}</span>
      <div class="tab-meta">${ageBadge}${snoozeBadge}${newBadge}${facetBadges}${frozenBadge}${dupBadge}${dupFacetBadge}${similarBadge}${tab.reading_time_min ? `<span class="tab-age fresh">${tab.reading_time_min}min</span>` : ''}</div>
      ${summaryPreview}
    </div>
    <div class="tab-actions">
      <button class="tab-action-btn" title="总结" data-action="summarize">📝</button>
      <button class="tab-action-btn" title="快照" data-action="snapshot">📸</button>
      <button class="tab-action-btn" title="稍后读" data-action="snooze">⏰</button>
      <button class="tab-action-btn" title="收藏" data-action="bookmark">⭐</button>
      <button class="tab-action-btn" title="跳转" data-action="focus">↗</button>
      <button class="tab-action-btn danger" title="关闭" data-action="close">✕</button>
    </div>
  `;

  const favicon = div.querySelector('.tab-favicon');
  if (favicon) favicon.addEventListener('error', () => { favicon.style.display = 'none'; });

  div.querySelector('.tab-checkbox').addEventListener('change', (e) => {
    e.target.checked ? state.selectedIds.add(tab.id) : state.selectedIds.delete(tab.id);
    div.classList.toggle('selected', e.target.checked);
    updateBatchBar();
  });

  div.querySelector('.tab-info').addEventListener('click', () => {
    if (tab.chromeTabId) focusTab(tab.chromeTabId);
  });

  div.querySelectorAll('.tab-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleTabAction(btn.dataset.action, tab, div, btn);
    });
  });

  div.querySelectorAll('.dup-badge-clickable').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      showDuplicatePopup(tab, badge);
    });
  });

  return div;
}

async function handleTabAction(action, tab, div, triggerEl) {
  if (action === 'close') {
    showCloseContextPicker(triggerEl, async (context) => {
      if (tab.chromeTabId) await closeTab(tab.chromeTabId);
      if (state.backendConnected) {
        await backendPatch(`/api/tabs/${tab.id}/status`, { status: 'closed', context });
      }
      removeTabFromState(tab.id);
      div.remove();
      updateCounts();
    });
    return;
  } else if (action === 'focus') {
    if (tab.chromeTabId) focusTab(tab.chromeTabId);
  } else if (action === 'summarize') {
    showTabSummaryChoice(tab, triggerEl);
  } else if (action === 'snooze') {
    state.snoozeTargetIds = [tab.id];
    $('#snoozeHint').textContent = '选择提醒时间';
    toggleModal('snoozeModal', true);
  } else if (action === 'bookmark') {
    openFolderPicker(async (folderId) => {
      await bookmarkToFolder(folderId, tab.title || tab.url, tab.url);
      toast(`已收藏: ${(tab.title || '').slice(0, 30)}`);
    });
  } else if (action === 'snapshot') {
    if (!state.backendConnected) return toast('需要后端连接');
    if (!tab.chromeTabId) return toast('无法获取页面内容');
    toast('正在保存快照...');
    const result = await snapshotTab(tab.chromeTabId, { screenshot: true, mhtml: false });
    if (result.error) toast('快照失败: ' + result.error);
    else toast(`快照已保存: ${(tab.title || '').slice(0, 30)}`);
  }
}

function showCloseContextPicker(triggerEl, onConfirm) {
  const existing = document.querySelector('.close-context-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'close-context-popup';
  const options = [
    { value: 'resolved', label: '✅ 已解决', desc: '问题已处理' },
    { value: 'not_needed', label: '🗑️ 不需要了', desc: '不再有价值' },
    { value: 'bookmarked', label: '⭐ 已收藏', desc: '已保存到收藏' },
    { value: '', label: '⚡ 直接关闭', desc: '不记录原因' },
  ];
  popup.innerHTML = `
    <div class="close-ctx-header">关闭原因</div>
    ${options.map(o => `<button class="close-ctx-btn" data-ctx="${o.value}">
      <span class="close-ctx-label">${o.label}</span>
      <span class="close-ctx-desc">${o.desc}</span>
    </button>`).join('')}
  `;

  const rect = triggerEl.getBoundingClientRect();
  popup.style.position = 'fixed';
  popup.style.top = `${rect.bottom + 4}px`;
  popup.style.left = `${Math.max(4, Math.min(rect.left - 40, window.innerWidth - 200))}px`;
  document.body.appendChild(popup);

  popup.querySelectorAll('.close-ctx-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      popup.remove();
      onConfirm(btn.dataset.ctx);
    });
  });

  const dismiss = (e) => {
    if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 10);
}

function showDuplicatePopup(tab, triggerEl) {
  const existing = document.querySelector('.dup-popup');
  if (existing) existing.remove();

  const { exactGroups, similarGroups } = buildDuplicateReport(state.tabs);

  let relatedTabs = [];
  let label = '';
  for (const group of exactGroups) {
    if (group.some(t => t.id === tab.id)) {
      relatedTabs = group.filter(t => t.id !== tab.id);
      label = '完全重复';
      break;
    }
  }
  if (!relatedTabs.length) {
    for (const group of similarGroups) {
      if (group.some(t => t.id === tab.id)) {
        relatedTabs = group.filter(t => t.id !== tab.id);
        label = '疑似相似';
        break;
      }
    }
  }
  if (!relatedTabs.length) return;

  const popup = document.createElement('div');
  popup.className = 'dup-popup';
  popup.innerHTML = `
    <div class="dup-popup-header">${label} (${relatedTabs.length + 1} 个)</div>
    <div class="dup-popup-current">
      <img class="tab-favicon" src="${tab.faviconUrl || tab.favicon_url || ''}" alt="">
      <span class="dup-popup-title" title="${esc(tab.url)}">${esc((tab.title || '').slice(0, 50))}</span>
      <span class="dup-popup-tag">当前</span>
    </div>
    ${relatedTabs.map(t => `<div class="dup-popup-item" data-tab-id="${t.id}" data-chrome-id="${t.chromeTabId || ''}">
      <img class="tab-favicon" src="${t.faviconUrl || t.favicon_url || ''}" alt="">
      <span class="dup-popup-title" title="${esc(t.url)}">${esc((t.title || '').slice(0, 50))}</span>
      <div class="dup-popup-actions">
        <button class="dup-popup-btn" data-action="focus" title="激活">↗</button>
        <button class="dup-popup-btn danger" data-action="close" title="关闭">✕</button>
      </div>
    </div>`).join('')}
  `;

  const rect = triggerEl.getBoundingClientRect();
  popup.style.position = 'fixed';
  popup.style.top = `${rect.bottom + 4}px`;
  popup.style.left = `${Math.max(4, Math.min(rect.left - 60, window.innerWidth - 280))}px`;
  document.body.appendChild(popup);

  popup.querySelectorAll('.tab-favicon').forEach(img => img.addEventListener('error', () => { img.style.display = 'none'; }));
  popup.querySelectorAll('.dup-popup-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.dup-popup-item');
      const tabId = item.dataset.tabId;
      const chromeId = parseInt(item.dataset.chromeId);
      if (btn.dataset.action === 'focus' && chromeId) {
        await focusTab(chromeId);
      } else if (btn.dataset.action === 'close') {
        if (chromeId) await closeTab(chromeId);
        if (state.backendConnected) await backendPatch(`/api/tabs/${tabId}/status`, { status: 'closed' });
        removeTabFromState(tabId);
        item.remove();
        renderTabs();
        updateCounts();
      }
    });
  });

  const dismiss = (e) => {
    if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 10);
}

async function closeGroupTabs(group) {
  const chromeTabs = group.tabs.filter(t => t.chromeTabId);
  if (chromeTabs.length) await closeTabs(chromeTabs.map(t => t.chromeTabId));
  if (state.backendConnected) await backendPost('/api/tabs/close-batch', { tabIds: group.tabs.map(t => t.id) });
  for (const tab of group.tabs) removeTabFromState(tab.id);
  renderTabs();
  updateCounts();
  toast(`已关闭「${group.name}」下 ${group.tabs.length} 个标签`);
}

export function updateBatchBar() {
  const count = state.selectedIds.size;
  $('#batchActions').style.display = count > 0 ? '' : 'none';
  $('#selectedCount').textContent = `${count} 已选`;
}

export function updateBudgetDisplay() {
  const count = state.tabs.length;
  const max = state.settings.budget;
  const pct = Math.min(100, (count / max) * 100);

  $('#tabCount').textContent = count;
  const fill = $('#budgetFill');
  fill.style.width = pct + '%';
  fill.className = 'budget-fill' + (pct > 90 ? ' danger' : pct > 70 ? ' warning' : '');

  if (count > max) toast(`⚠️ 标签数 (${count}) 已超出预算 (${max})！`);
}

export function updateCounts() {
  updateBudgetDisplay();
}

export function populateCategoryFilter() {
  const sel = $('#filterCategory');
  sel.innerHTML = '<option value="all">所有分类</option>';
  for (const cat of state.categories) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.icon || ''} ${cat.name} (${cat.tabs.length})`;
    sel.appendChild(opt);
  }
}
