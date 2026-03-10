import { backendGet, backendPost, backendDelete } from '../../lib/api-client.js';
import { state, $, esc, toast, toggleModal } from './state.js';

export async function saveSession() {
  if (!state.backendConnected) return toast('需要后端连接');
  const name = prompt('会话名称：', `${new Date().toLocaleDateString('zh-CN')} 研究`);
  if (!name) return;
  const result = await backendPost('/api/tabs/sessions', { name });
  if (result.error) return toast('保存失败');
  toast(`会话已保存: ${result.tabCount} 个标签`);
}

export async function viewSessions() {
  toggleModal('sessionsModal', true);
  const body = $('#sessionsBody');
  body.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  if (!state.backendConnected) { body.innerHTML = '<p style="text-align:center;color:var(--c-text3)">需要后端连接</p>'; return; }

  const result = await backendGet('/api/tabs/sessions/list');
  if (result.error || !result.sessions?.length) { body.innerHTML = '<p style="text-align:center;color:var(--c-text3);padding:20px">暂无保存的会话</p>'; return; }

  body.innerHTML = result.sessions.map(s => {
    const tabs = Array.isArray(s.tab_snapshot) ? s.tab_snapshot : [];
    const date = new Date(s.created_at).toLocaleString('zh-CN');
    let tabListHtml = tabs.map((t, i) => `<div class="session-tab-item"><input type="checkbox" class="session-tab-cb" data-idx="${i}"><span class="session-tab-title" title="${esc(t.url)}">${esc((t.title || t.url || '').slice(0, 60))}</span></div>`).join('');

    return `<div class="session-block" data-session-id="${s.id}">
      <div class="session-header">
        <div class="session-info">
          <span class="session-name">${esc(s.name)}</span>
          <span class="session-meta">${tabs.length} 标签 · ${date}</span>
        </div>
        <div class="session-actions">
          <button class="btn btn-sm btn-ghost session-toggle">▼</button>
          <button class="btn btn-sm btn-primary session-restore">恢复选中</button>
          <button class="btn btn-sm btn-ghost session-restore-all">全部</button>
        </div>
      </div>
      <div class="session-tab-list" style="display:none">
        <div style="padding:5px 12px;display:flex;gap:8px;align-items:center;border-bottom:0.5px solid var(--c-border)">
          <label style="font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px"><input type="checkbox" class="session-select-all"> 全选</label>
          <span class="session-selected-count" style="font-size:11px;color:var(--c-text3)"></span>
        </div>
        ${tabListHtml}
      </div>
    </div>`;
  }).join('');

  body.querySelectorAll('.session-toggle').forEach(btn => btn.addEventListener('click', () => {
    const list = btn.closest('.session-block').querySelector('.session-tab-list');
    const h = list.style.display === 'none';
    list.style.display = h ? '' : 'none';
    btn.textContent = h ? '▲' : '▼';
  }));
  body.querySelectorAll('.session-select-all').forEach(cb => cb.addEventListener('change', () => {
    cb.closest('.session-block').querySelectorAll('.session-tab-cb').forEach(tcb => { tcb.checked = cb.checked; });
  }));
  body.querySelectorAll('.session-restore').forEach(btn => btn.addEventListener('click', () => {
    const block = btn.closest('.session-block');
    const session = result.sessions.find(s => s.id === block.dataset.sessionId);
    if (!session) return;
    const list = block.querySelector('.session-tab-list');
    if (list.style.display === 'none') { list.style.display = ''; block.querySelector('.session-toggle').textContent = '▲'; toast('请勾选要恢复的标签'); return; }
    const checked = [...block.querySelectorAll('.session-tab-cb:checked')].map(cb => parseInt(cb.dataset.idx));
    if (checked.length === 0) return toast('请勾选要恢复的标签');
    for (const idx of checked) if (session.tab_snapshot[idx]?.url) chrome.tabs.create({ url: session.tab_snapshot[idx].url, active: false });
    toast(`正在恢复 ${checked.length}/${session.tab_snapshot.length} 个标签`);
  }));
  body.querySelectorAll('.session-restore-all').forEach(btn => btn.addEventListener('click', () => {
    const session = result.sessions.find(s => s.id === btn.closest('.session-block').dataset.sessionId);
    if (!session) return;
    for (const tab of session.tab_snapshot) if (tab.url) chrome.tabs.create({ url: tab.url, active: false });
    toast(`正在恢复 ${session.tab_snapshot.length} 个标签...`);
  }));
}

export async function viewSnapshots() {
  toggleModal('snapshotsModal', true);
  const body = $('#snapshotsBody');
  body.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  const result = await backendGet('/api/snapshots');
  if (result.error || !result.snapshots?.length) { body.innerHTML = '<p style="text-align:center;color:var(--c-text3);padding:20px">暂无快照</p>'; return; }

  body.innerHTML = result.snapshots.map(s => {
    const date = new Date(s.created_at).toLocaleString('zh-CN');
    return `<div class="session-item snap-item" data-snap-id="${s.id}" data-snap-url="${esc(s.url)}">
      <div class="session-info" style="cursor:pointer;min-width:0">
        <span class="session-name snap-title-link" title="点击浏览快照">${esc(s.title || s.url)}</span>
        <span class="session-meta">${date} · ${esc(s.domain)}</span>
      </div>
      <div class="session-actions" style="flex-wrap:wrap;gap:4px">
        <button class="btn btn-sm btn-primary snap-restore" title="打开原始链接">↗ 原链</button>
        ${s.hasHtml ? `<button class="btn btn-sm btn-accent snap-view" data-type="html" title="查看HTML快照">📄 快照</button>` : ''}
        ${s.hasScreenshot ? `<button class="btn btn-sm btn-ghost snap-view" data-type="screenshot" title="查看截图">🖼️ 截图</button>` : ''}
        <button class="btn btn-sm btn-ghost snap-delete" style="color:var(--c-danger)" title="删除快照">✕</button>
      </div>
    </div>`;
  }).join('');

  body.querySelectorAll('.snap-title-link').forEach(el => el.addEventListener('click', () => {
    const item = el.closest('[data-snap-id]');
    const snapId = item.dataset.snapId;
    const snap = result.snapshots.find(s => s.id === snapId);
    if (snap?.hasHtml) chrome.tabs.create({ url: `${state.settings.backendUrl}/api/snapshots/${snapId}/html` });
    else chrome.tabs.create({ url: item.dataset.snapUrl, active: false });
  }));
  body.querySelectorAll('.snap-restore').forEach(btn => btn.addEventListener('click', () => chrome.tabs.create({ url: btn.closest('[data-snap-url]').dataset.snapUrl, active: false })));
  body.querySelectorAll('.snap-view').forEach(btn => btn.addEventListener('click', () => chrome.tabs.create({ url: `${state.settings.backendUrl}/api/snapshots/${btn.closest('[data-snap-id]').dataset.snapId}/${btn.dataset.type}` })));
  body.querySelectorAll('.snap-delete').forEach(btn => btn.addEventListener('click', async () => {
    await backendDelete(`/api/snapshots/${btn.closest('[data-snap-id]').dataset.snapId}`);
    btn.closest('.session-item').remove();
    toast('快照已删除');
  }));
}

export async function viewApiLogs() {
  toggleModal('apiLogsModal', true);
  const body = $('#apiLogsBody');
  body.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  const result = await backendGet('/api/tabs/api-logs?limit=100');
  if (result.error || !result.logs?.length) { body.innerHTML = '<p style="text-align:center;color:var(--c-text3);padding:20px">暂无调用记录</p>'; return; }

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <span style="font-size:12px;color:var(--c-text2)">共 ${result.total} 条</span>
    <button class="btn btn-sm btn-ghost" id="btnClearLogs">清空</button>
  </div>`;
  for (const log of result.logs) {
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN');
    const tokens = log.inputTokens ? `${log.inputTokens}→${log.outputTokens}` : '';
    html += `<div class="log-entry">
      <span class="log-badge ${log.success ? 'success' : 'error'}">${log.success ? 'OK' : 'ERR'}</span>
      <span class="log-provider">${esc(log.provider)}</span>
      <span class="log-model">${esc(log.model || '')}</span>
      ${tokens ? `<span class="log-tokens">${tokens} tok</span>` : ''}
      <span class="log-duration">${log.durationMs}ms</span>
      <span class="log-time">${time}</span>
    </div>`;
  }
  body.innerHTML = html;
  body.querySelector('#btnClearLogs')?.addEventListener('click', async () => { await backendDelete('/api/tabs/api-logs'); toast('日志已清空'); viewApiLogs(); });
}
