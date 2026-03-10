import { backendGet } from '../../lib/api-client.js';
import { state, $, esc, toast, toggleModal } from './state.js';

export async function viewResearch() {
  if (!state.backendConnected) return toast('需要后端连接');
  toggleModal('researchModal', true);
  const body = $('#researchBody');
  body.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  const data = await backendGet('/api/tabs/research-sessions');
  if (data.error || !data.sessions?.length) {
    body.innerHTML = '<div class="state-panel"><p>未检测到研究会话</p><p style="font-size:11px;color:var(--c-text3)">当短时间内打开同一主题/域名的 3+ 标签时，系统会自动识别为研究会话</p></div>';
    return;
  }

  body.innerHTML = data.sessions.map(s => {
    const start = new Date(s.startedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="research-session-card">
      <div class="research-session-header">
        <span class="research-topic">${esc(s.topic)}</span>
        <span class="research-meta">${s.tabCount} 标签 · ${s.durationMin} 分钟 · ${start}</span>
      </div>
      <div class="research-domains">${s.domains.slice(0, 5).map(d => `<span class="research-domain-tag">${esc(d)}</span>`).join('')}</div>
      <div class="research-tabs">${s.tabs.slice(0, 5).map(t => `<div class="research-tab-item" title="${esc(t.url)}">${esc((t.title || '').slice(0, 50))}</div>`).join('')}${s.tabs.length > 5 ? `<div class="research-tab-item" style="color:var(--c-text3)">...还有 ${s.tabs.length - 5} 个</div>` : ''}</div>
    </div>`;
  }).join('');
}

export async function viewWeeklyReport() {
  if (!state.backendConnected) return toast('需要后端连接');
  const data = await backendGet('/api/tabs/weekly-report');
  if (data.error) return toast('获取周报失败');

  const topicsHtml = (data.topTopics || []).map(t => `<span class="research-domain-tag">${esc(t.topic)} (${t.count})</span>`).join('');
  const stalestHtml = (data.stalestTabs || []).map(t =>
    `<div class="research-tab-item">${esc(t.title)} · <span style="color:var(--c-danger)">${t.ageDays} 天</span></div>`
  ).join('');

  const body = $('#researchBody');
  body.innerHTML = `
    <div class="research-session-card">
      <div class="research-session-header">
        <span class="research-topic">📊 本周概览</span>
        <span class="research-meta">${new Date(data.period?.from).toLocaleDateString('zh-CN')} - ${new Date(data.period?.to).toLocaleDateString('zh-CN')}</span>
      </div>
      <div class="research-domains" style="margin:8px 0">
        <span class="research-domain-tag" style="background:var(--c-success-light);color:var(--c-success)">新增 ${data.newTabs || 0}</span>
        <span class="research-domain-tag" style="background:var(--c-danger-light);color:var(--c-danger)">关闭 ${data.closedTabs || 0}</span>
        <span class="research-domain-tag">活跃 ${data.activeTabs || 0}</span>
      </div>
      ${topicsHtml ? `<div style="margin-bottom:6px"><div style="font-size:11px;color:var(--c-text3);margin-bottom:4px">热门主题</div><div class="research-domains">${topicsHtml}</div></div>` : ''}
      ${stalestHtml ? `<div><div style="font-size:11px;color:var(--c-text3);margin-bottom:4px">积灰最久</div>${stalestHtml}</div>` : ''}
    </div>
  `;
  toggleModal('researchModal', true);
}

export async function runAnalysis() {
  if (!state.backendConnected) return toast('需要后端连接');
  toggleModal('analysisModal', true);
  $('#analysisBody').innerHTML = '<div class="spinner" style="margin:20px auto"></div><p style="text-align:center;color:var(--c-text3)">正在分析...</p>';
  const data = await backendGet('/api/tabs/analysis');
  if (data.error) { $('#analysisBody').innerHTML = `<p>分析失败: ${esc(data.error)}</p>`; return; }
  $('#analysisBody').innerHTML = renderAnalysis(data);
}

function renderAnalysis(d) {
  const o = d.overview, p = d.persona;
  let html = '';
  html += `<div class="an-stat-grid"><div class="an-stat-box"><div class="an-stat-num">${o.total}</div><div class="an-stat-label">活跃标签</div></div><div class="an-stat-box"><div class="an-stat-num">${o.uniqueDomains}</div><div class="an-stat-label">独立域名</div></div><div class="an-stat-box"><div class="an-stat-num">${d.topics.length}</div><div class="an-stat-label">技术方向</div></div></div>`;
  html += `<h4>核心身份</h4><div class="an-persona-card">${p.identity.map(id => `<span class="an-tag identity">${esc(id)}</span>`).join('')}</div>`;
  html += `<h4>技术兴趣图谱</h4><table><tr><th>方向</th><th>#</th><th>热度</th></tr>${p.techInterests.map(t => `<tr><td>${esc(t.name)}</td><td>${t.count}</td><td><span class="an-bar ${t.intensity}" style="width:${Math.min(100, t.count * 3)}px"></span></td></tr>`).join('')}</table>`;
  html += `<h4>主题聚类</h4><table><tr><th>主题</th><th>#</th><th>%</th></tr>${d.topics.map(t => `<tr><td>${esc(t.name)}</td><td>${t.count}</td><td>${t.pct}%</td></tr>`).join('')}</table>`;
  html += `<h4>信息来源</h4><table><tr><th>平台</th><th>#</th><th>%</th></tr>${d.platforms.map(pl => `<tr><td>${esc(pl.name)}</td><td>${pl.count}</td><td>${pl.pct}%</td></tr>`).join('')}</table>`;
  html += `<h4>学习风格</h4><div class="an-persona-card">${p.learningStyle.map(s => `<span class="an-tag style">${esc(s.split(' — ')[0])}</span>`).join('')}</div>`;
  html += `<h4>性格特征</h4><div class="an-persona-card">${p.traits.map(tr => `<span class="an-tag trait">${esc(tr.trait)}</span>`).join('')}</div>`;
  html += `<h4>清理建议</h4><div class="an-persona-card"><div class="an-cleanup-row"><span>立即可清理</span><b>${p.cleanup.immediate} 个</b></div><div class="an-cleanup-row"><span>清理后预计</span><b>${o.total} → ${p.cleanup.estimatedAfter} 个</b></div></div>`;
  return html;
}
