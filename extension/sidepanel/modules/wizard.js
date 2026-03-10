import { closeTab, focusTab, backendPost, backendPatch } from '../../lib/api-client.js';
import { state, $, esc, toast, getModel, getAgeText, getAgeDays, removeTabFromState } from './state.js';
import { renderTabs, updateCounts } from './render.js';
import { buildDuplicateReport } from './duplicate-utils.js';
import { showTabSummaryChoice } from './summary.js';

export async function startWizard() {
  if (!state.backendConnected || state.tabs.length === 0) return toast('请先扫描标签');

  state.wizardDecisions = {};

  const stages = buildStages(state.tabs, state.categories);
  if (stages.length === 0) return toast('没有需要处理的标签');

  let currentStage = 0;
  let catPhase = 'summary';
  const aiCollapsedMap = {};

  const overlay = document.createElement('div');
  overlay.className = 'wizard-overlay';
  overlay.id = 'wizardOverlay';
  document.body.appendChild(overlay);

  const summaryCache = {};

  const LETTER_COLORS = ['#FF3B30','#FF9500','#FFCC00','#34C759','#00C7BE','#30B0C7','#007AFF','#5856D6','#AF52DE','#FF2D55','#A2845E','#8E8E93'];
  function stageIcon(s) {
    if (!s.isCategoryStage || (s.icon && s.icon !== '🌐' && s.icon !== '📁')) {
      return `<span class="stage-dot-icon">${s.icon}</span>`;
    }
    const name = s.title || '';
    const letter = (name.match(/[a-zA-Z]/) || [name.charAt(0)])[0].toUpperCase();
    const colorIdx = name.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    const bg = LETTER_COLORS[Math.abs(colorIdx) % LETTER_COLORS.length];
    return `<span class="stage-dot-icon letter-icon" style="background:${bg}">${letter}</span>`;
  }

  let isReviewMode = false;

  prefetchCategorySummary(findNextCategoryStage());
  render();

  function render() {
    if (isReviewMode) { renderReview(); return; }

    const stage = stages[currentStage];
    const totalTabs = stages.reduce((n, s) => n + s.tabs.length, 0);
    const totalDecided = Object.keys(state.wizardDecisions).length;
    const overallPct = totalTabs > 0 ? Math.round((totalDecided / totalTabs) * 100) : 0;

    const needsSummary = stage.isCategoryStage;
    const showSummaryPhase = needsSummary && catPhase === 'summary';

    prefetchCategorySummary(stage);

    overlay.innerHTML = `
      <div class="wizard-panel">
        <div class="wizard-header">
          <h3>🧹 渐进式清理</h3>
          <button class="modal-close" id="wizardClose">&times;</button>
        </div>

        <div class="wizard-progress-overview">
          <div class="wizard-progress-bar"><div class="wizard-progress-fill" style="width:${overallPct}%"></div></div>
          <div class="wizard-progress-label">已决策 ${totalDecided}/${totalTabs} · 阶段 ${currentStage + 1}/${stages.length}</div>
        </div>

        <div class="wizard-stage-nav" id="wizardStageNav">
          ${stages.map((s, i) => {
            const stageDecided = s.tabs.filter(t => state.wizardDecisions[t.id]).length;
            return `<div class="wizard-stage-dot ${i < currentStage ? 'done' : i === currentStage ? 'active' : ''}" data-stage-idx="${i}" title="${s.title} (${s.tabs.length})">
              ${stageIcon(s)}
              ${stageDecided > 0 ? `<span class="stage-badge">${stageDecided}</span>` : ''}
              ${i === currentStage ? `<span class="stage-dot-label">${esc(s.title)}</span>` : ''}
            </div>`;
          }).join('')}
          <div class="wizard-stage-dot review ${isReviewMode ? 'active' : ''}" id="wizardGoReview" title="决策汇总">
            <span class="stage-dot-icon">📋</span>
            ${totalDecided > 0 ? `<span class="stage-badge accent">${totalDecided}</span>` : ''}
          </div>
        </div>

        ${showSummaryPhase ? `
        <div class="wizard-phase-indicator">
          <span class="phase-tag active">① 概览</span>
          <span class="phase-arrow">→</span>
          <span class="phase-tag">② 决策</span>
        </div>` : needsSummary ? `
        <div class="wizard-phase-indicator">
          <span class="phase-tag done">① 概览</span>
          <span class="phase-arrow">→</span>
          <span class="phase-tag active">② 决策</span>
        </div>` : ''}

        <div class="wizard-body">
          <div class="wizard-stage-header">
            <span class="wizard-stage-icon">${stage.icon}</span>
            <div class="wizard-stage-info">
              <div class="wizard-stage-title">${esc(stage.title)}</div>
              <div class="wizard-stage-subtitle">${esc(stage.subtitle)}</div>
            </div>
            <div class="wizard-difficulty">
              ${'●'.repeat(stage.difficulty)}${'○'.repeat(5 - stage.difficulty)}
            </div>
          </div>

          ${stage.hint ? `<div class="wizard-hint-box">${esc(stage.hint)}</div>` : ''}

          ${showSummaryPhase ? renderCategorySummary(stage) : renderDecisionView(stage)}
        </div>

        <div class="wizard-footer">
          <button class="btn btn-sm btn-ghost" id="wizardPrev" ${currentStage === 0 && (!needsSummary || catPhase === 'summary') ? 'disabled' : ''}>上一步</button>
          <span style="font-size:11px;color:var(--c-text3)" id="wizardDecisionCount"></span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost" id="wizardSkip">跳过</button>
            ${showSummaryPhase
              ? `<button class="btn btn-sm btn-primary" id="wizardToDecide" ${summaryCache[stage.categoryId] ? '' : 'disabled'}>开始决策 →</button>`
              : `<button class="btn btn-sm btn-primary" id="wizardNext">${currentStage === stages.length - 1 ? '📋 查看汇总' : '下一阶段 →'}</button>`
            }
          </div>
        </div>
      </div>
    `;

    updateDecisionCount();
    bindEvents(stage);

    const nextCategory = findNextCategoryStage();
    if (nextCategory && nextCategory.categoryId !== stage.categoryId) prefetchCategorySummary(nextCategory);
  }

  function renderReview() {
    const decisions = state.wizardDecisions;
    const totalDecided = Object.keys(decisions).length;
    const totalTabs = stages.reduce((n, s) => n + s.tabs.length, 0);

    const groups = { close: [], bookmark: [], keep: [], later: [] };
    const labels = { close: '✕ 关闭', bookmark: '⭐ 收藏', keep: '✓ 保留', later: '◷ 稍后' };
    const colors = { close: '#FF3B30', bookmark: '#FF9500', keep: '#34C759', later: '#007AFF' };

    for (const [tabId, decision] of Object.entries(decisions)) {
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab) groups[decision]?.push(tab);
    }

    const undecided = [];
    for (const s of stages) {
      for (const t of s.tabs) {
        if (!decisions[t.id]) undecided.push(t);
      }
    }

    let groupsHtml = '';
    for (const [action, tabs] of Object.entries(groups)) {
      if (!tabs.length) continue;
      groupsHtml += `<div class="review-group">
        <div class="review-group-header" style="border-left:3px solid ${colors[action]};padding-left:8px">
          <span style="font-weight:600">${labels[action]}</span>
          <span style="color:var(--c-text3);font-size:12px">${tabs.length} 个标签</span>
        </div>
        <div class="review-group-tabs">${tabs.map(t => `
          <div class="review-tab" data-tab-id="${t.id}">
            <img class="tab-favicon" src="${t.faviconUrl || t.favicon_url || ''}" alt="" style="width:14px;height:14px">
            <span class="tab-title" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${esc(t.title || t.url || '无标题')}</span>
            <select class="review-change-action" data-tab-id="${t.id}" style="font-size:11px;padding:1px 4px;border-radius:6px;border:1px solid var(--c-border)">
              ${Object.entries(labels).map(([k, v]) => `<option value="${k}" ${k === action ? 'selected' : ''}>${v}</option>`).join('')}
              <option value="">取消决策</option>
            </select>
          </div>
        `).join('')}</div>
      </div>`;
    }

    if (undecided.length > 0) {
      groupsHtml += `<div class="review-group">
        <div class="review-group-header" style="border-left:3px solid var(--c-text3);padding-left:8px">
          <span style="font-weight:600;color:var(--c-text3)">未决策</span>
          <span style="color:var(--c-text3);font-size:12px">${undecided.length} 个标签</span>
        </div>
      </div>`;
    }

    overlay.innerHTML = `
      <div class="wizard-panel">
        <div class="wizard-header">
          <h3>📋 决策汇总</h3>
          <button class="modal-close" id="wizardClose">&times;</button>
        </div>

        <div class="wizard-progress-overview">
          <div class="wizard-progress-bar"><div class="wizard-progress-fill" style="width:${totalTabs > 0 ? Math.round(totalDecided / totalTabs * 100) : 0}%"></div></div>
          <div class="wizard-progress-label">已决策 ${totalDecided}/${totalTabs} · 未决策 ${undecided.length}</div>
        </div>

        <div class="wizard-stage-nav" id="wizardStageNav">
          ${stages.map((s, i) => {
            const stageDecided = s.tabs.filter(t => state.wizardDecisions[t.id]).length;
            return `<div class="wizard-stage-dot ${i === currentStage ? 'done' : ''}" data-stage-idx="${i}" title="${s.title}">
              ${stageIcon(s)}
              ${stageDecided > 0 ? `<span class="stage-badge">${stageDecided}</span>` : ''}
            </div>`;
          }).join('')}
          <div class="wizard-stage-dot review active" id="wizardGoReview" title="决策汇总">
            <span class="stage-dot-icon">📋</span>
            ${totalDecided > 0 ? `<span class="stage-badge accent">${totalDecided}</span>` : ''}
          </div>
        </div>

        <div class="wizard-body" style="overflow-y:auto">
          <div class="review-stats" style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
            ${Object.entries(groups).map(([k, tabs]) => tabs.length > 0 ? `<div style="display:flex;align-items:center;gap:4px;font-size:13px"><span style="color:${colors[k]}">●</span>${labels[k]} <b>${tabs.length}</b></div>` : '').join('')}
          </div>
          ${groupsHtml || '<div style="text-align:center;padding:30px;color:var(--c-text3)">尚未做出任何决策</div>'}
        </div>

        <div class="wizard-footer">
          <button class="btn btn-sm btn-ghost" id="wizardBackToStages">← 返回编辑</button>
          <span style="font-size:11px;color:var(--c-text3)">${totalDecided > 0 ? `${groups.close.length} 关 · ${groups.bookmark.length} 藏 · ${groups.keep.length} 留 · ${groups.later.length} 后` : ''}</span>
          <button class="btn btn-sm btn-primary" id="wizardConfirmExecute" ${totalDecided === 0 ? 'disabled' : ''}>🎉 确认执行 (${totalDecided})</button>
        </div>
      </div>
    `;

    overlay.querySelector('#wizardClose').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#wizardBackToStages').addEventListener('click', () => { isReviewMode = false; render(); });
    overlay.querySelector('#wizardConfirmExecute')?.addEventListener('click', () => { isReviewMode = false; finishWizard(overlay); });

    overlay.querySelectorAll('.wizard-stage-dot[data-stage-idx]').forEach(dot => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.dataset.stageIdx, 10);
        if (idx >= 0 && idx < stages.length) {
          isReviewMode = false;
          currentStage = idx;
          catPhase = stages[currentStage].isCategoryStage ? 'summary' : 'summary';
          render();
        }
      });
    });

    overlay.querySelectorAll('.review-change-action').forEach(sel => {
      sel.addEventListener('change', () => {
        const tabId = sel.dataset.tabId;
        if (sel.value) state.wizardDecisions[tabId] = sel.value;
        else delete state.wizardDecisions[tabId];
        renderReview();
      });
    });

    overlay.querySelectorAll('.tab-favicon').forEach(img => {
      img.addEventListener('error', () => { img.style.display = 'none'; });
    });
  }

  function updateStageBadges() {
    const nav = overlay.querySelector('#wizardStageNav');
    if (!nav) return;
    nav.querySelectorAll('.wizard-stage-dot[data-stage-idx]').forEach(dot => {
      const idx = parseInt(dot.dataset.stageIdx, 10);
      const stage = stages[idx];
      if (!stage) return;
      const count = stage.tabs.filter(t => state.wizardDecisions[t.id]).length;
      let badge = dot.querySelector('.stage-badge');
      if (count > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'stage-badge'; dot.appendChild(badge); }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    });
    const reviewDot = overlay.querySelector('#wizardGoReview');
    if (reviewDot) {
      const total = Object.keys(state.wizardDecisions).length;
      let badge = reviewDot.querySelector('.stage-badge');
      if (total > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'stage-badge accent'; reviewDot.appendChild(badge); }
        badge.textContent = total;
      } else if (badge) { badge.remove(); }
    }
  }

  function renderCategorySummary(stage) {
    const cached = summaryCache[stage.categoryId];
    if (!cached) {
      return `<div class="wizard-summary-phase">
        <div class="spinner" style="margin:20px auto"></div>
        <p style="text-align:center;color:var(--c-text3);font-size:13px">AI 正在分析「${esc(stage.title)}」...</p>
      </div>`;
    }

    let html = '<div class="wizard-summary-phase">';
    html += `<div class="wizard-summary-card"><div class="wizard-summary-text">${esc(cached.group_summary || '暂无总结')}</div>`;
    if (cached.themes?.length) {
      html += `<div class="wizard-themes"><span class="wizard-themes-label">主题:</span> ${cached.themes.map(t => `<span class="wizard-theme-tag">${esc(t)}</span>`).join('')}</div>`;
    }
    if (cached.priority_reads?.length) {
      html += `<div class="wizard-priority"><h5>推荐优先阅读</h5><ul>${cached.priority_reads.slice(0, 3).map(p => `<li>${esc(p.reason || p.title || p.id)}</li>`).join('')}</ul></div>`;
    }
    if (cached.outdated?.length) {
      html += `<div class="wizard-outdated"><h5>⚠️ 可能过时 (${cached.outdated.length})</h5><ul>${cached.outdated.slice(0, 3).map(o => `<li>${esc(o.reason || o.id)}</li>`).join('')}</ul></div>`;
    }
    if (cached.duplicates?.length) {
      html += `<div class="wizard-dups"><h5>疑似重复 (${cached.duplicates.length})</h5><ul>${cached.duplicates.slice(0, 3).map(d => `<li>${esc(d.reason)}</li>`).join('')}</ul></div>`;
    }
    html += '</div>';

    const stats = computeStats(stage.tabs);
    html += `<div class="wizard-quick-stats">`;
    html += `<div class="wizard-stat"><span class="wizard-stat-num">${stage.tabs.length}</span><span class="wizard-stat-label">标签</span></div>`;
    html += `<div class="wizard-stat"><span class="wizard-stat-num">${stats.domains}</span><span class="wizard-stat-label">域名</span></div>`;
    html += `<div class="wizard-stat"><span class="wizard-stat-num">${stats.old}</span><span class="wizard-stat-label">>30天</span></div>`;
    html += `<div class="wizard-stat"><span class="wizard-stat-num">${stats.frozen}</span><span class="wizard-stat-label">冻结</span></div>`;
    html += `</div>`;
    html += `<p class="wizard-hint" style="margin-top:6px">阅读以上分析后，点击「开始决策」逐一处理</p>`;
    html += '</div>';
    return html;
  }

  function renderDecisionView(stage) {
    let html = '';
    if (stage.isCategoryStage) {
      const cached = summaryCache[stage.categoryId];
      const collapsed = aiCollapsedMap[stage.id] === true;
      html += `<div class="wizard-ai-panel">
        <button class="wizard-ai-header" id="wizardToggleAi">
          <span>🤖 AI 建议（${cached ? '已就绪' : '生成中'}）</span>
          <span>${collapsed ? '▶' : '▼'}</span>
        </button>
        <div class="wizard-ai-body" style="display:${collapsed ? 'none' : ''}" id="wizardAiBody">
          ${cached ? renderAiSuggestion(cached) : '<div class="wizard-ai-loading"><div class="spinner"></div><span>AI 建议生成中...</span></div>'}
        </div>
      </div>`;
    }

    const bulkOrder = stage.defaultDecision === 'close'
      ? ['close', 'keep', 'bookmark', 'later']
      : ['keep', 'close', 'bookmark', 'later'];
    const bulkLabels = { close: '✕ 全部关闭', keep: '✓ 全部保留', bookmark: '⭐ 全部收藏', later: '◷ 全部稍后' };
    html += `<div class="wizard-bulk-bar">`;
    for (const d of bulkOrder) {
      html += `<button class="wizard-decision-btn ${d} wizard-bulk" data-d="${d}">${bulkLabels[d]}</button>`;
    }
    html += `</div>`;
    html += '<div id="wizardTabs"></div>';
    return html;
  }

  function renderAiSuggestion(cached) {
    const priorityIds = (cached.priority_reads || []).map(i => i.id).filter(Boolean);
    const outdatedIds = (cached.outdated || []).map(i => i.id).filter(Boolean);
    const duplicateIds = (cached.duplicates || []).flatMap(i => i.ids || []).filter(Boolean);

    return `
      <div class="wizard-ai-summary">${esc(cached.group_summary || '暂无建议')}</div>
      <div class="wizard-ai-quick">
        <button class="wizard-quick-btn" data-quick="priority" ${priorityIds.length ? '' : 'disabled'}>保留推荐阅读 (${priorityIds.length})</button>
        <button class="wizard-quick-btn" data-quick="outdated" ${outdatedIds.length ? '' : 'disabled'}>关闭可能过时 (${outdatedIds.length})</button>
        <button class="wizard-quick-btn" data-quick="duplicates" ${duplicateIds.length ? '' : 'disabled'}>关闭疑似重复 (${duplicateIds.length})</button>
      </div>
      ${cached.themes?.length ? `<div class="wizard-ai-tags">${cached.themes.slice(0, 6).map(t => `<span class="wizard-theme-tag">${esc(t)}</span>`).join('')}</div>` : ''}
    `;
  }

  function bindEvents(stage) {
    overlay.querySelector('#wizardClose').addEventListener('click', () => overlay.remove());

    overlay.querySelectorAll('.wizard-stage-dot[data-stage-idx]').forEach(dot => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.dataset.stageIdx, 10);
        if (idx !== currentStage && idx >= 0 && idx < stages.length) {
          currentStage = idx;
          catPhase = stages[currentStage].isCategoryStage ? 'summary' : 'summary';
          render();
        }
      });
    });

    overlay.querySelector('#wizardPrev')?.addEventListener('click', () => {
      if (stage.isCategoryStage && catPhase === 'decide') {
        catPhase = 'summary';
        render();
      } else if (currentStage > 0) {
        currentStage--;
        catPhase = stages[currentStage].isCategoryStage ? 'decide' : 'summary';
        render();
      }
    });

    overlay.querySelector('#wizardSkip')?.addEventListener('click', () => {
      advanceStage();
    });

    overlay.querySelector('#wizardToDecide')?.addEventListener('click', () => {
      catPhase = 'decide';
      render();
    });

    overlay.querySelector('#wizardNext')?.addEventListener('click', () => {
      advanceStage();
    });

    overlay.querySelector('#wizardGoReview')?.addEventListener('click', () => {
      isReviewMode = true;
      render();
    });

    overlay.querySelectorAll('.wizard-bulk').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.d;
        stage.tabs.forEach(tab => { state.wizardDecisions[tab.id] = d; });
        const tabContainer = overlay.querySelector('#wizardTabs');
        if (tabContainer) renderTabList(tabContainer, stage);
        updateDecisionCount();
        updateStageBadges();
      });
    });

    overlay.querySelector('#wizardToggleAi')?.addEventListener('click', () => {
      aiCollapsedMap[stage.id] = !(aiCollapsedMap[stage.id] === true);
      render();
    });

    overlay.querySelectorAll('.wizard-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cached = summaryCache[stage.categoryId];
        if (!cached) return;
        const stageTabIds = new Set(stage.tabs.map(t => t.id));
        if (btn.dataset.quick === 'priority') {
          (cached.priority_reads || []).forEach(i => { if (i.id && stageTabIds.has(i.id)) state.wizardDecisions[i.id] = 'keep'; });
        } else if (btn.dataset.quick === 'outdated') {
          (cached.outdated || []).forEach(i => { if (i.id && stageTabIds.has(i.id)) state.wizardDecisions[i.id] = 'close'; });
        } else if (btn.dataset.quick === 'duplicates') {
          (cached.duplicates || []).forEach(i => (i.ids || []).forEach(id => {
            if (stageTabIds.has(id)) state.wizardDecisions[id] = 'close';
          }));
        }
        const tabContainer = overlay.querySelector('#wizardTabs');
        if (tabContainer) renderTabList(tabContainer, stage);
        updateDecisionCount();
        updateStageBadges();
      });
    });

    const tabContainer = overlay.querySelector('#wizardTabs');
    if (tabContainer) renderTabList(tabContainer, stage);
  }

  function advanceStage() {
    if (currentStage < stages.length - 1) {
      currentStage++;
      catPhase = 'summary';
      render();
    } else {
      isReviewMode = true;
      render();
    }
  }

  function renderTabList(container, stage) {
    container.innerHTML = stage.tabs.map(tab => {
      const decision = state.wizardDecisions[tab.id] || '';
      const age = getAgeText(tab.first_seen_at || tab.lastAccessed);
      const dupInfo = tab._dupOf ? `<span class="wizard-tab-dup-label">🔴 与「${esc((tab._dupOf || '').slice(0, 35))}」重复</span>` : '';
      const simInfo = tab._similarTo ? `<span class="wizard-tab-dup-label">🟡 类似「${esc((tab._similarTo || '').slice(0, 35))}」</span>` : '';
      return `<div class="wizard-tab-row ${decision ? 'decided' : ''}" data-tab-id="${tab.id}">
        <div class="wtr-main">
          <img class="tab-favicon" src="${tab.faviconUrl || tab.favicon_url || ''}" alt="">
          <div class="wizard-tab-info">
            <span class="tab-title" title="${esc(tab.url)}">${esc(tab.title || '无标题')}</span>
            <span class="wizard-tab-url">${esc((tab.url || '').slice(0, 60))}</span>
            <span class="wizard-tab-domain">${esc(tab.domain || '')}${age ? ` · ${age.text}` : ''}</span>
            ${dupInfo}${simInfo}
          </div>
          <div class="wizard-row-actions">
            <button class="wizard-mini-action" data-a="focus" title="激活">↗</button>
            <button class="wizard-mini-action" data-a="summary" title="总结">📝</button>
            <button class="wizard-mini-action" data-a="bookmark" title="收藏">⭐</button>
            <button class="wizard-mini-action" data-a="export" title="复制链接">📤</button>
          </div>
        </div>
        <div class="wtr-actions">
          <div class="wizard-decision">
            <button class="wizard-decision-btn keep ${decision === 'keep' ? 'active' : ''}" data-d="keep">✓ 保留</button>
            <button class="wizard-decision-btn bookmark ${decision === 'bookmark' ? 'active' : ''}" data-d="bookmark">⭐ 收藏</button>
            <button class="wizard-decision-btn close ${decision === 'close' ? 'active' : ''}" data-d="close">✕ 关闭</button>
            <button class="wizard-decision-btn later ${decision === 'later' ? 'active' : ''}" data-d="later">◷ 稍后</button>
          </div>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.tab-favicon').forEach(img => {
      img.addEventListener('error', () => { img.style.display = 'none'; });
    });

    container.querySelectorAll('.wizard-decision-btn').forEach(btn => {
      if (btn.classList.contains('wizard-bulk')) return;
      btn.addEventListener('click', () => {
        const row = btn.closest('.wizard-tab-row');
        const tabId = row.dataset.tabId;
        const isSame = state.wizardDecisions[tabId] === btn.dataset.d;
        row.querySelectorAll('.wizard-decision-btn').forEach(b => b.classList.remove('active'));
        if (isSame) {
          delete state.wizardDecisions[tabId];
          row.classList.remove('decided');
        } else {
          btn.classList.add('active');
          row.classList.add('decided');
          state.wizardDecisions[tabId] = btn.dataset.d;
        }
        updateDecisionCount();
        updateStageBadges();
      });
    });

    container.querySelectorAll('.wizard-mini-action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const row = btn.closest('.wizard-tab-row');
        const tab = stage.tabs.find(t => t.id === row.dataset.tabId);
        if (!tab) return;

        if (btn.dataset.a === 'focus' && tab.chromeTabId) {
          await focusTab(tab.chromeTabId);
        } else if (btn.dataset.a === 'summary') {
          showTabSummaryChoice(tab, btn);
        } else if (btn.dataset.a === 'bookmark') {
          state.wizardDecisions[tab.id] = 'bookmark';
          row.querySelectorAll('.wizard-decision-btn').forEach(b => b.classList.remove('active'));
          row.querySelector('.wizard-decision-btn.bookmark')?.classList.add('active');
          updateDecisionCount();
          toast('已标记为收藏');
        } else if (btn.dataset.a === 'export') {
          try {
            await navigator.clipboard.writeText(tab.url || '');
            toast('链接已复制');
          } catch {
            toast('复制失败');
          }
        }
      });
    });
  }

  function updateDecisionCount() {
    const el = overlay.querySelector('#wizardDecisionCount');
    if (!el) return;
    const total = Object.keys(state.wizardDecisions).length;
    const close = Object.values(state.wizardDecisions).filter(d => d === 'close').length;
    const bm = Object.values(state.wizardDecisions).filter(d => d === 'bookmark').length;
    const keep = Object.values(state.wizardDecisions).filter(d => d === 'keep').length;
    el.textContent = total > 0 ? `已决策 ${total} (关${close} 藏${bm} 留${keep})` : '';
  }

  async function loadCategorySummary(categoryId) {
    summaryCache[`${categoryId}_loading`] = true;
    try {
      const result = await backendPost(`/api/tabs/summarize-group/${categoryId}`, { model: getModel() });
      summaryCache[categoryId] = result;
      delete summaryCache[`${categoryId}_loading`];
      if (stages[currentStage]?.categoryId === categoryId) render();
    } catch {
      summaryCache[categoryId] = { group_summary: '总结加载失败' };
      delete summaryCache[`${categoryId}_loading`];
      if (stages[currentStage]?.categoryId === categoryId) render();
    }
  }

  function prefetchCategorySummary(stage) {
    if (!stage?.isCategoryStage) return;
    if (!summaryCache[stage.categoryId] && !summaryCache[`${stage.categoryId}_loading`]) {
      loadCategorySummary(stage.categoryId);
    }
  }

  function findNextCategoryStage() {
    for (let i = currentStage; i < stages.length; i++) {
      if (stages[i].isCategoryStage) return stages[i];
    }
    return null;
  }

  function computeStats(tabs) {
    const domainSet = new Set();
    let old = 0, frozen = 0;
    for (const t of tabs) {
      domainSet.add(t.domain || 'unknown');
      if (getAgeDays(t.first_seen_at || t.lastAccessed) > 30) old++;
      if (t.discarded) frozen++;
    }
    return { domains: domainSet.size, old, frozen };
  }
}

const WIZARD_FACET_STAGES = [
  { facet: 'duplicate', icon: '🔴', title: '完全重复的标签',    difficulty: 1, defaultDecision: 'close', hint: 'URL 完全一致，默认建议保留一份、关闭其余。' },
  { facet: 'outdated',  icon: '📅', title: '超过 30 天的旧标签', difficulty: 2, defaultDecision: 'close', hint: '长期未读标签优先清理。重要内容可先标记收藏。' },
  { facet: 'similar',   icon: '🟡', title: '疑似相似的标签',    difficulty: 3, defaultDecision: null,    hint: '这些标签标题/路径相近，建议对比后保留最有价值的一份。' },
  { facet: 'frozen',    icon: '❄️', title: '被浏览器冻结的标签', difficulty: 4, defaultDecision: 'close', hint: '浏览器已将其冻结，通常表示近期价值较低，可优先处理。' },
  { facet: 'snoozed',   icon: '⏰', title: '稍后阅读中的标签',  difficulty: 3, defaultDecision: null,    hint: '这些标签已标记为稍后阅读，检查是否还需要保留。' },
];

function buildStages(tabs, categories) {
  const stages = [];
  const handledIds = new Set();

  const usePersistentFacets = tabs.some(t => Array.isArray(t.facets) && t.facets.length > 0);

  if (usePersistentFacets) {
    for (const def of WIZARD_FACET_STAGES) {
      const matched = tabs.filter(t =>
        !handledIds.has(t.id) &&
        Array.isArray(t.facets) &&
        t.facets.includes(def.facet)
      );
      if (!matched.length) continue;
      matched.forEach(t => handledIds.add(t.id));

      const enriched = matched.map(t => {
        if (def.facet === 'duplicate') {
          const sameCluster = matched.filter(m => m.duplicate_cluster_id && m.duplicate_cluster_id === t.duplicate_cluster_id && m.id !== t.id);
          const dupLabel = sameCluster.length
            ? sameCluster[0].title?.slice(0, 40) || sameCluster[0].url
            : t.url;
          return { ...t, _dupOf: dupLabel };
        }
        return t;
      });

      if (def.facet === 'duplicate') {
        enriched.sort((a, b) => (a.duplicate_cluster_id || '').localeCompare(b.duplicate_cluster_id || '') || (a.url || '').localeCompare(b.url || ''));
      } else if (def.facet === 'outdated') {
        enriched.sort((a, b) => getAgeDays(b.first_seen_at || b.lastAccessed) - getAgeDays(a.first_seen_at || a.lastAccessed));
      }

      stages.push({
        id: def.facet,
        icon: def.icon,
        title: def.title,
        subtitle: `${matched.length} 个标签`,
        hint: def.hint,
        tabs: enriched,
        defaultDecision: def.defaultDecision,
        difficulty: def.difficulty,
      });
    }
  } else {
    const { exactGroups, similarGroups } = buildDuplicateReport(tabs);

    const duplicateTabs = [];
    for (const group of exactGroups) {
      for (let i = 1; i < group.length; i++) {
        duplicateTabs.push({ ...group[i], _dupOf: group[0].title });
        handledIds.add(group[i].id);
      }
    }
    if (duplicateTabs.length) {
      stages.push({
        id: 'duplicate', icon: '🔴', title: '完全重复的标签',
        subtitle: `${duplicateTabs.length} 个重复标签可直接清理`,
        hint: 'URL 完全一致，默认建议保留一份、关闭其余。',
        tabs: duplicateTabs, defaultDecision: 'close', difficulty: 1,
      });
    }

    const oldTabs = tabs.filter(t => !handledIds.has(t.id) && getAgeDays(t.first_seen_at || t.lastAccessed) > 30);
    oldTabs.forEach(t => handledIds.add(t.id));
    if (oldTabs.length) {
      stages.push({
        id: 'outdated', icon: '📅', title: '超过 30 天的旧标签',
        subtitle: `${oldTabs.length} 个长期未处理标签`,
        hint: '长期未读标签优先清理。重要内容可先标记收藏。',
        tabs: oldTabs.sort((a, b) => getAgeDays(b.first_seen_at || b.lastAccessed) - getAgeDays(a.first_seen_at || a.lastAccessed)),
        defaultDecision: 'close', difficulty: 2,
      });
    }

    const similarTabs = [];
    for (const group of similarGroups) {
      for (const tab of group) {
        if (handledIds.has(tab.id)) continue;
        similarTabs.push({ ...tab, _similarTo: group[0].title });
        handledIds.add(tab.id);
      }
    }
    if (similarTabs.length) {
      stages.push({
        id: 'similar', icon: '🟡', title: '疑似相似的标签',
        subtitle: `${similarTabs.length} 个标签需要人工判别`,
        hint: '这些标签标题/路径相近，建议对比后保留最有价值的一份。',
        tabs: similarTabs, defaultDecision: null, difficulty: 3,
      });
    }

    const frozenTabs = tabs.filter(t => !handledIds.has(t.id) && t.discarded);
    frozenTabs.forEach(t => handledIds.add(t.id));
    if (frozenTabs.length) {
      stages.push({
        id: 'frozen', icon: '❄️', title: '被浏览器冻结的标签',
        subtitle: `${frozenTabs.length} 个低活跃标签`,
        hint: '浏览器已将其冻结，通常表示近期价值较低，可优先处理。',
        tabs: frozenTabs, defaultDecision: 'close', difficulty: 4,
      });
    }
  }

  const categoryStages = categories
    .map((cat) => {
      const rest = cat.tabs.filter(t => !handledIds.has(t.id));
      return {
        id: `cat-${cat.id}`,
        icon: cat.icon || '📁',
        title: cat.name,
        subtitle: `${rest.length} 个标签`,
        hint: null,
        tabs: rest,
        defaultDecision: null,
        difficulty: 5,
        isCategoryStage: true,
        categoryId: cat.id,
      };
    })
    .filter(stage => stage.tabs.length > 0)
    .sort((a, b) => b.tabs.length - a.tabs.length);
  stages.push(...categoryStages);

  return stages;
}

async function finishWizard(overlay) {
  const decisions = state.wizardDecisions;
  const total = Object.keys(decisions).length;
  if (total === 0) {
    overlay.remove();
    toast('没有需要执行的决策');
    return;
  }

  overlay.querySelector('.wizard-body').innerHTML = `
    <div style="text-align:center;padding:30px 0">
      <div class="spinner" style="margin:0 auto 12px"></div>
      <p style="color:var(--c-text2)">正在执行清理决策...</p>
    </div>`;
  overlay.querySelector('.wizard-footer').style.display = 'none';

  let closed = 0, bookmarked = 0;

  for (const [tabId, decision] of Object.entries(decisions)) {
    const tab = state.tabs.find(t => t.id === tabId);
    if (!tab) continue;

    if (state.backendConnected) {
      try { await backendPatch(`/api/tabs/${tabId}/decision`, { decision }); } catch {}
    }

    if (decision === 'close') {
      if (tab.chromeTabId) await closeTab(tab.chromeTabId);
      if (state.backendConnected) await backendPatch(`/api/tabs/${tabId}/status`, { status: 'closed' });
      removeTabFromState(tabId);
      closed++;
    } else if (decision === 'bookmark') {
      try {
        const tree = await chrome.bookmarks.search({ title: 'Tab Helper' });
        let folderId;
        if (tree.length > 0) folderId = tree[0].id;
        else {
          const folder = await chrome.bookmarks.create({ title: 'Tab Helper' });
          folderId = folder.id;
        }
        await chrome.bookmarks.create({ parentId: folderId, title: tab.title || tab.url, url: tab.url });
        if (tab.chromeTabId) await closeTab(tab.chromeTabId);
        if (state.backendConnected) await backendPatch(`/api/tabs/${tabId}/status`, { status: 'archived' });
        removeTabFromState(tabId);
        bookmarked++;
      } catch {}
    }
  }

  overlay.remove();
  renderTabs();
  updateCounts();

  const kept = Object.values(decisions).filter(d => d === 'keep').length;
  const later = Object.values(decisions).filter(d => d === 'later').length;
  toast(`🎉 清理完成: 关闭 ${closed} · 收藏 ${bookmarked} · 保留 ${kept} · 稍后 ${later}`);
}
