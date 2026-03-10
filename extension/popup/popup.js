import { getAllTabs, backendGet, backendPost } from '../lib/api-client.js';

document.addEventListener('DOMContentLoaded', async () => {
  const result = await getAllTabs();
  const tabs = (result.tabs || []).filter(t => t.url && !t.url.startsWith('chrome://'));

  document.getElementById('tabTotal').textContent = tabs.length;

  const stored = await chrome.storage.local.get(['settings']);
  const budget = stored.settings?.budget || 100;

  const domains = new Set();
  for (const t of tabs) {
    try { domains.add(new URL(t.url).hostname.replace(/^www\./, '')); } catch {}
  }
  document.getElementById('domainTotal').textContent = domains.size;

  const tabEl = document.getElementById('tabTotal');
  if (tabs.length > budget) {
    tabEl.style.color = '#FF3B30';
    tabEl.title = `超出预算 (${budget})`;
  } else if (tabs.length > budget * 0.7) {
    tabEl.style.color = '#FF9500';
  }

  const health = await backendGet('/api/health');
  const info = document.getElementById('backendInfo');
  if (health.error) {
    info.textContent = '⚠️ 后端未连接';
    info.style.color = '#FF3B30';
  } else {
    info.textContent = `✓ 已连接 · ${health.aiProvider}`;
    info.style.color = '#34C759';
  }

  document.getElementById('btnOpen').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  });

  document.getElementById('btnQuickScan').addEventListener('click', () => {
    const grouped = {};
    for (const t of tabs) {
      let domain;
      try { domain = new URL(t.url).hostname.replace(/^www\./, ''); } catch { domain = 'other'; }
      grouped[domain] = (grouped[domain] || 0) + 1;
    }

    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const container = document.getElementById('quickResult');
    container.style.display = '';
    document.getElementById('summaryResult').style.display = 'none';
    container.innerHTML = sorted.map(([d, c]) =>
      `<div class="domain-row"><span>${d}</span><span><b>${c}</b></span></div>`
    ).join('');
  });

  document.getElementById('btnSummarizeCurrent').addEventListener('click', async () => {
    const container = document.getElementById('summaryResult');
    document.getElementById('quickResult').style.display = 'none';
    container.style.display = '';
    container.innerHTML = '<div class="summary-loading"><div style="width:20px;height:20px;border:2px solid #E8E8ED;border-top-color:#007AFF;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px"></div>正在总结当前页面...</div>';
    container.innerHTML += '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>';

    if (health.error) {
      container.innerHTML = '<p style="color:#FF3B30">需要后端连接</p>';
      return;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url || activeTab.url.startsWith('chrome://')) {
      container.innerHTML = '<p style="color:#6E6E73">此页面无法总结</p>';
      return;
    }

    const tabId = `tab-${activeTab.id}`;
    await backendPost('/api/tabs/sync', {
      tabs: [{
        id: tabId,
        chromeTabId: activeTab.id,
        url: activeTab.url,
        title: activeTab.title,
        faviconUrl: activeTab.favIconUrl || '',
      }],
    });

    try {
      const contentResult = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'EXTRACT_CONTENT', tabId: activeTab.id }, resolve);
      });
      if (contentResult?.content) {
        await backendPost('/api/tabs/content', { tabId, content: contentResult.content });
      }
    } catch {}

    const summary = await backendPost(`/api/tabs/summarize/${tabId}`, { detailed: false });

    if (summary.error) {
      container.innerHTML = `<p style="color:#FF3B30">总结失败: ${esc(summary.error)}</p>`;
      return;
    }

    let html = `<p>${esc(summary.summary || '无摘要')}</p>`;
    if (summary.key_points?.length) {
      html += '<h4>关键要点</h4><ul>' + summary.key_points.map(p => `<li>${esc(p)}</li>`).join('') + '</ul>';
    }
    if (summary.freshness && summary.freshness !== 'unknown') {
      const labels = { fresh: '🟢 新鲜', aging: '🟡 老化', outdated: '🔴 过时' };
      html += `<h4>时效性</h4><p>${labels[summary.freshness] || summary.freshness}</p>`;
    }
    if (summary.reading_time_min) {
      html += `<h4>阅读时间</h4><p>${summary.reading_time_min} 分钟</p>`;
    }

    container.innerHTML = html;
  });
});

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
