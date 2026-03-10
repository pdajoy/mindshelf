import { extractAllContent, backendPost, backendGet } from '../../lib/api-client.js';
import { state, $, toast, showLoading, hideLoading, showProgress, hideProgress, getModel, FACET_DEFS } from './state.js';
import { renderTabs, updateBudgetDisplay, updateCounts, populateCategoryFilter } from './render.js';
import { buildDuplicateReport, applyDuplicateBadges } from './duplicate-utils.js';

function logNow() {
  const d = new Date();
  return `${d.toLocaleTimeString('zh-CN', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

let classifyLogCount = 0;
let classifyLogRunning = false;

function resetClassifyLog() {
  const panel = $('#classifyLog');
  panel.style.display = '';
  classifyLogCount = 0;
  classifyLogRunning = true;
  panel.innerHTML = `
    <div class="classify-log-header" id="classifyLogHeader">
      <div class="classify-log-title">
        <span class="pulse-dot"></span>
        <span>AI 分类流水线</span>
        <span class="classify-log-counter" id="classifyLogCounter">0 条</span>
      </div>
      <span class="classify-log-toggle">▼</span>
    </div>
    <div class="classify-log-body" id="classifyLogBody"></div>
  `;
  panel.classList.remove('collapsed');

  panel.querySelector('#classifyLogHeader').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
  });
}

function appendClassifyLog(text, type = '') {
  const panel = $('#classifyLog');
  panel.style.display = '';
  const body = panel.querySelector('#classifyLogBody') || panel;

  const line = document.createElement('div');
  line.className = `line${type ? ` ${type}` : ''}`;
  line.textContent = `[${logNow()}] ${text}`;
  line.style.animationDelay = `${Math.min(classifyLogCount * 30, 200)}ms`;
  body.appendChild(line);
  classifyLogCount++;

  const counter = panel.querySelector('#classifyLogCounter');
  if (counter) counter.textContent = `${classifyLogCount} 条`;

  while (body.childElementCount > 200) body.removeChild(body.firstChild);
  body.scrollTop = body.scrollHeight;
}

function finishClassifyLog() {
  classifyLogRunning = false;
  const dot = document.querySelector('.classify-log .pulse-dot');
  if (dot) dot.classList.add('done');
}

export function refreshDuplicateIndicators() {
  const { exactGroups, similarGroups } = buildDuplicateReport(state.tabs);
  applyDuplicateBadges(state.tabs, exactGroups, similarGroups);

  const realDupIds = new Set(exactGroups.flatMap(g => g.map(t => t.id)));
  const realSimIds = new Set(similarGroups.flatMap(g => g.map(t => t.id)));
  for (const tab of state.tabs) {
    const facets = new Set(tab.facets || []);
    if (realDupIds.has(tab.id)) facets.add('duplicate');
    else facets.delete('duplicate');
    if (realSimIds.has(tab.id)) facets.add('similar');
    else facets.delete('similar');
    tab.facets = [...facets];
  }
}

export function updateFacetChipCounts() {
  const counts = {};
  for (const tab of state.tabs) {
    if (tab._isNew) counts['new'] = (counts['new'] || 0) + 1;
    for (const f of (tab.facets || [])) {
      counts[f] = (counts[f] || 0) + 1;
    }
  }
  state.facetStats = counts;

  for (const key of Object.keys(FACET_DEFS)) {
    const el = $(`#fc-${key}`);
    if (el) el.textContent = counts[key] ? `(${counts[key]})` : '';
  }
}

export function applyCategoryResult(data) {
  if (!data.categories) return;
  const catMap = {};
  for (const cat of data.categories) catMap[cat.id] = { ...cat, tabs: [] };
  catMap['uncategorized'] = { id: 'uncategorized', name: '未分类', icon: '📌', color: '#9CA3AF', tabs: [], tab_count: 0 };

  if (data.tabs) {
    const backendMap = {};
    for (const bt of data.tabs) backendMap[bt.id] = bt;
    for (const tab of state.tabs) {
      const bt = backendMap[tab.id];
      if (bt) {
        tab.topic_id = bt.topic_id;
        tab.category_id = bt.category_id;
        tab.facets = bt.facets || [];
        tab.summary = bt.summary;
        tab.ai_recommendation = bt.ai_recommendation;
        tab.freshness_score = bt.freshness_score;
        tab.duplicate_cluster_id = bt.duplicate_cluster_id;
        tab.priority_score = bt.priority_score;
      }
      tab._isNew = !tab.topic_id;
    }
  }

  for (const tab of state.tabs) {
    const catId = tab.topic_id || tab.category_id || 'uncategorized';
    if (!catMap[catId]) catMap[catId] = { id: catId, name: catId, icon: '📌', color: '#6B7280', tabs: [], tab_count: 0 };
    catMap[catId].tabs.push(tab);
  }

  state.categories = Object.values(catMap).filter(c => c.tabs.length > 0).sort((a, b) => b.tabs.length - a.tabs.length);
  refreshDuplicateIndicators();
  updateFacetChipCounts();
  populateCategoryFilter();
}

export async function categorizeTabs(selectedTabIds = null) {
  if (!state.backendConnected) return toast('需要后端连接');

  const targetTabs = selectedTabIds
    ? state.tabs.filter(t => selectedTabIds.includes(t.id))
    : state.tabs;

  if (targetTabs.length === 0) return toast('没有可分类的标签');

  const isSelective = !!selectedTabIds;
  const label = isSelective ? `选中的 ${targetTabs.length}` : `${targetTabs.length}`;

  resetClassifyLog();
  appendClassifyLog(`开始智能分类流程，待处理标签 ${label} 个${isSelective ? '（增量模式）' : ''}`, 'stage');

  showLoading('正在提取页面内容...');
  showProgress(3, '⓪ 提取页面内容...');
  appendClassifyLog('阶段0：抽取页面内容并上传到后端');

  const chromeTabIds = targetTabs.filter(t => t.chromeTabId).map(t => t.chromeTabId);
  if (chromeTabIds.length > 0) {
    const contents = await extractAllContent(chromeTabIds);
    if (contents && !contents.error) {
      const payloads = [];
      for (const tab of targetTabs) {
        const c = contents[tab.chromeTabId];
        if (c && c.content) payloads.push({ tabId: tab.id, content: c.content });
      }
      for (let i = 0; i < payloads.length; i++) {
        await backendPost('/api/tabs/content', payloads[i]);
        showProgress(3 + (i / payloads.length) * 12, `⓪ 上传内容 ${i + 1}/${payloads.length}...`);
      }
      appendClassifyLog(`阶段0完成：成功抽取并上传 ${payloads.length} 个标签内容`);
    }
  }

  showProgress(15, '① 开始智能分类流水线...');
  showLoading('AI 智能分类中...');

  const stageRanges = { 1: [15, 25], 2: [25, 40], 3: [40, 55], 4: [55, 88], 5: [88, 100] };
  const stageIcons = { 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤' };

  try {
    const params = new URLSearchParams();
    if (getModel()) params.set('model', getModel());
    if (selectedTabIds) params.set('tabIds', selectedTabIds.join(','));
    const qs = params.toString();
    const es = new EventSource(`${state.settings.backendUrl}/api/tabs/categorize-stream${qs ? '?' + qs : ''}`);
    let lastStageLine = '';

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'start') {
        appendClassifyLog(`发现 ${data.total} 个可分类标签，开始逐级分析`, 'stage');
      } else if (data.type === 'stage') {
        const range = stageRanges[data.stage] || [50, 60];
        const icon = stageIcons[data.stage] || '';
        const stagePct = data.pct / 100;
        const globalPct = range[0] + stagePct * (range[1] - range[0]);
        const desc = data.stageDesc || data.stageName;
        showProgress(globalPct, `${icon} ${data.stageName}: ${desc}`);
        showLoading(`${icon} ${data.stageName}...`);

        const stageLine = `${icon} 阶段${data.stage} ${data.stageName} · ${desc}`;
        if (stageLine !== lastStageLine) {
          appendClassifyLog(stageLine, 'stage');
          lastStageLine = stageLine;
        }

        if (data.detail?.domains) {
          appendClassifyLog(`  └ 识别域名数：${data.detail.domains}`);
        } else if (typeof data.detail?.matched === 'number') {
          appendClassifyLog(`  └ 规则命中：${data.detail.matched}/${data.detail.total}`);
          const top = Object.entries(data.detail.byCategory || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
          if (top.length) appendClassifyLog(`  └ 规则分类Top：${top.map(([k, v]) => `${k}(${v})`).join('、')}`);
        } else if (typeof data.detail?.newMatches === 'number') {
          appendClassifyLog(`  └ 标题增量分类：${data.detail.newMatches} 个`);
          const top = Object.entries(data.detail.byCategory || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
          if (top.length) appendClassifyLog(`  └ 标题分类Top：${top.map(([k, v]) => `${k}(${v})`).join('、')}`);
        } else if (data.batch && data.totalBatches) {
          appendClassifyLog(`  └ AI 批次：${data.batch}/${data.totalBatches}，已处理 ${data.processed}/${data.total}`);
        } else if (data.detail?.avgConfidence) {
          const topCategory = Object.entries(data.detail.byCategory || {}).sort((a, b) => b[1] - a[1])[0];
          const topText = topCategory ? `${topCategory[0]}(${topCategory[1]})` : 'N/A';
          appendClassifyLog(`  └ 平均置信度：${data.detail.avgConfidence}% · 主类别：${topText} · 画像倾向：${data.detail.profileHint || '未知'}`);
        }
      } else if (data.type === 'done') {
        es.close();
        showProgress(100, '✅ 分类完成!');
        applyCategoryResult(data);
        hideLoading();
        setTimeout(hideProgress, 1500);
        renderTabs();
        const summary = (data.categories || []).map(c => `${c.id}:${c.tab_count}`).join(' | ');
        appendClassifyLog(`分类完成，类别分布 => ${summary || '无'}`, 'stage');
        if (data.facetStats) {
          const facetLine = Object.entries(data.facetStats).map(([k, v]) => `${k}:${v}`).join(' · ');
          if (facetLine) appendClassifyLog(`Facet 统计 => ${facetLine}`);
        }
        if (data.dupClusters) appendClassifyLog(`  └ 重复集群数: ${data.dupClusters}`);
        finishClassifyLog();
        toast(`已分类 ${state.tabs.length} 个标签`);
      } else if (data.type === 'error') {
        es.close();
        hideProgress();
        hideLoading();
        appendClassifyLog(`分类失败：${data.error}`, 'error');
        finishClassifyLog();
        toast('分类失败: ' + data.error);
      }
    };

    es.onerror = () => {
      es.close();
      hideProgress();
      hideLoading();
      appendClassifyLog('SSE 中断，回退到非流式分类', 'warn');
      finishClassifyLog();
      categorizeTabsFallback();
    };
  } catch { categorizeTabsFallback(); }
}

async function categorizeTabsFallback() {
  showLoading('AI 分类中...');
  appendClassifyLog('使用回退路径：一次性分类请求', 'warn');
  const result = await backendPost('/api/tabs/categorize', { model: getModel() });
  if (result.error) {
    appendClassifyLog(`回退路径失败：${result.error}`, 'error');
    toast('分类失败: ' + result.error);
    hideLoading();
    return;
  }
  applyCategoryResult(result);
  hideLoading();
  renderTabs();
  appendClassifyLog('回退路径分类完成', 'stage');
  toast(`已分类 ${state.tabs.length} 个标签`);
}
