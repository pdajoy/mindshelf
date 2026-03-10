import { backendPost, backendPatch, bookmarkToFolder, closeTab, focusTab } from '../../lib/api-client.js';
import { state, $, esc, toast, toggleModal, getModel, showProgress, hideProgress, removeTabFromState } from './state.js';
import { openFolderPicker } from './bookmarks.js';

function renderMd(text) {
  if (!text) return '';

  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

  const lines = text.split('\n');
  let html = '';
  let inList = false;
  let listType = '';

  function closeList() {
    if (inList) { html += `</${listType}>`; inList = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      closeList();
      if (html && !html.endsWith('<br>')) html += '<br>';
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      closeList();
      const level = Math.min(hMatch[1].length + 2, 6);
      html += `<h${level}>${inline(hMatch[2])}</h${level}>`;
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') { closeList(); html += '<ul>'; inList = true; listType = 'ul'; }
      html += `<li>${inline(ulMatch[1])}</li>`;
      continue;
    }

    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') { closeList(); html += '<ol>'; inList = true; listType = 'ol'; }
      html += `<li>${inline(olMatch[1])}</li>`;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      closeList();
      html += `<blockquote>${inline(trimmed.slice(2))}</blockquote>`;
      continue;
    }

    closeList();
    html += `<p>${inline(trimmed)}</p>`;
  }

  closeList();
  return html || `<p>${escHtml(text)}</p>`;
}

export function showTabSummaryChoice(tab, triggerEl) {
  const rect = triggerEl?.getBoundingClientRect?.();
  const existing = document.querySelector('.summary-choice-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'summary-choice-popup';
  popup.innerHTML = `
    <button class="summary-choice-btn" data-mode="concise">
      <span class="choice-icon">⚡</span>
      <span>快速总结</span>
    </button>
    <button class="summary-choice-btn" data-mode="detailed">
      <span class="choice-icon">📋</span>
      <span>详细分析</span>
    </button>
  `;

  popup.style.position = 'fixed';
  if (rect) {
    const top = rect.bottom + 6;
    const left = Math.min(window.innerWidth - 150, Math.max(8, rect.left - 50));
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
  } else {
    popup.style.top = '84px';
    popup.style.right = '12px';
  }

  document.body.appendChild(popup);

  popup.querySelectorAll('.summary-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      popup.remove();
      showTabSummary(tab, btn.dataset.mode === 'detailed');
    });
  });

  const dismiss = (e) => {
    if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 10);
}

export async function showTabSummary(tab, detailed = false) {
  toggleModal('summaryModal', true);
  $('#summaryTitle').textContent = '';

  const body = $('#summaryBody');
  body.innerHTML = `
    <div class="chat-container">
      <div class="chat-hero">
        <div class="chat-hero-icon">${detailed ? '📋' : '⚡'}</div>
        <div class="chat-hero-title">${esc((tab.title || '').slice(0, 60) || '摘要')}</div>
        <div class="chat-hero-subtitle">${esc(tab.domain || tab.url || '')} · ${detailed ? '详细分析' : '快速总结'}</div>
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-actions" id="chatActions">
        <div class="chat-action-row" id="chatQuickActions">
          <button class="chat-action-btn" data-action="toggle-mode">${detailed ? '⚡ 简洁版' : '📋 详细版'}</button>
          <button class="chat-action-btn" data-action="copy">📋 复制</button>
          <button class="chat-action-btn" data-action="bookmark">⭐ 收藏</button>
          <button class="chat-action-btn" data-action="open">↗ 新标签</button>
          <button class="chat-action-btn" data-action="focus">🔍 激活</button>
          <button class="chat-action-btn" data-action="close-tab">✕ 关闭</button>
          <button class="chat-action-btn" data-action="export">📤 导出</button>
        </div>
      </div>
      <div class="chat-input-area" id="chatInputArea" style="display:none">
        <div class="chat-input-wrap">
          <input type="text" class="chat-input" id="chatInput" placeholder="追问更多细节...">
          <button class="chat-send-btn" id="chatSend">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const messagesEl = body.querySelector('#chatMessages');
  let fullText = '';
  let convId = null;
  let currentTab = tab;
  let currentDetailed = detailed;

  body.querySelector('#chatQuickActions').addEventListener('click', async (e) => {
    const btn = e.target.closest('.chat-action-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'toggle-mode') showTabSummary(tab, !detailed);
    else if (action === 'copy') {
      navigator.clipboard.writeText(fullText || '').then(() => toast('已复制总结内容'));
    }
    else if (action === 'bookmark') {
      openFolderPicker(async (folderId) => {
        await bookmarkToFolder(folderId, tab.title || tab.url, tab.url);
        toast(`已收藏: ${(tab.title || '').slice(0, 30)}`);
      });
    }
    else if (action === 'open') window.open(tab.url, '_blank');
    else if (action === 'focus') {
      if (tab.chromeTabId) focusTab(tab.chromeTabId);
      else toast('无法激活此标签');
    }
    else if (action === 'close-tab') {
      if (tab.chromeTabId) await closeTab(tab.chromeTabId);
      if (state.backendConnected) await backendPatch(`/api/tabs/${tab.id}/status`, { status: 'closed' });
      removeTabFromState(tab.id);
      toast('标签已关闭');
    }
    else if (action === 'export') {
      const blob = new Blob([`# ${tab.title}\n\n${tab.url}\n\n${fullText}`], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `summary-${(tab.title || 'tab').slice(0, 30)}.md`;
      a.click();
      toast('已导出 Markdown');
    }
  });

  if (!state.backendConnected) {
    addMessage(messagesEl, 'assistant', '需要后端连接才能生成摘要');
    return;
  }

  const thinkingEl = addMessage(messagesEl, 'assistant', null, true);

  const modelParam = getModel() ? `&model=${encodeURIComponent(getModel())}` : '';
  const url = `${state.settings.backendUrl}/api/tabs/summarize-stream/${tab.id}?detailed=${detailed}${modelParam}`;

  try {
    const es = new EventSource(url);

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chunk') {
        const convMatch = data.text.match(/<!--CONV:(.+?)-->/);
        if (convMatch) { convId = convMatch[1]; return; }
        fullText += data.text;
        thinkingEl.innerHTML = renderMd(fullText);
        thinkingEl.classList.remove('thinking');
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (data.type === 'done') {
        es.close();
        if (convId) enableFollowUp(body, convId, messagesEl);
      } else if (data.type === 'error') {
        es.close();
        thinkingEl.classList.remove('thinking');
        thinkingEl.innerHTML = `<span class="chat-error">总结失败: ${esc(data.error)}</span>`;
      }
    };

    es.onerror = () => {
      es.close();
      if (!fullText) fallbackNonStream(tab, detailed, body, messagesEl, thinkingEl);
    };
  } catch {
    fallbackNonStream(tab, detailed, body, messagesEl, thinkingEl);
  }
}

function addMessage(container, role, content, isThinking = false) {
  const wrapper = document.createElement('div');
  wrapper.className = `chat-msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = role === 'user' ? '👤' : '✨';

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}${isThinking ? ' thinking' : ''}`;

  if (isThinking) {
    bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
  } else if (content) {
    bubble.innerHTML = renderMd(content);
  }

  if (role === 'user') {
    wrapper.appendChild(bubble);
    wrapper.appendChild(avatar);
  } else {
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
  }

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function enableFollowUp(body, convId, messagesEl) {
  const inputArea = body.querySelector('#chatInputArea');
  inputArea.style.display = '';

  const sendFollowUp = async () => {
    const input = body.querySelector('#chatInput');
    const question = input.value.trim();
    if (!question) return;

    addMessage(messagesEl, 'user', question);
    input.value = '';

    const thinkingEl = addMessage(messagesEl, 'assistant', null, true);

    const modelParam = getModel() ? `&model=${encodeURIComponent(getModel())}` : '';
    const url = `${state.settings.backendUrl}/api/tabs/follow-up-stream?conversationId=${encodeURIComponent(convId)}&question=${encodeURIComponent(question)}${modelParam}`;

    let fullAnswer = '';
    try {
      const es = new EventSource(url);
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chunk') {
          fullAnswer += data.text;
          thinkingEl.innerHTML = renderMd(fullAnswer);
          thinkingEl.classList.remove('thinking');
          messagesEl.scrollTop = messagesEl.scrollHeight;
        } else if (data.type === 'done') {
          es.close();
        } else if (data.type === 'error') {
          es.close();
          thinkingEl.classList.remove('thinking');
          thinkingEl.innerHTML = `<span class="chat-error">${esc(data.error)}</span>`;
        }
      };
      es.onerror = () => {
        es.close();
        if (!fullAnswer) {
          backendPost('/api/tabs/follow-up', { conversationId: convId, question, model: getModel() }).then(resp => {
            thinkingEl.classList.remove('thinking');
            thinkingEl.innerHTML = renderMd(resp.error || resp.answer || '');
            messagesEl.scrollTop = messagesEl.scrollHeight;
          });
        }
      };
    } catch {
      backendPost('/api/tabs/follow-up', { conversationId: convId, question, model: getModel() }).then(resp => {
        thinkingEl.classList.remove('thinking');
        thinkingEl.innerHTML = renderMd(resp.error || resp.answer || '');
      });
    }
  };

  body.querySelector('#chatSend').addEventListener('click', sendFollowUp);
  body.querySelector('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowUp(); }
  });
  body.querySelector('#chatInput').focus();
}

async function fallbackNonStream(tab, detailed, body, messagesEl, thinkingEl) {
  const result = await backendPost(`/api/tabs/summarize/${tab.id}`, { detailed, model: getModel() });

  thinkingEl.classList.remove('thinking');

  if (result.error) {
    thinkingEl.innerHTML = `<span class="chat-error">摘要失败: ${esc(result.error)}</span>`;
    return;
  }

  let html = `<p>${esc(result.summary || '无摘要')}</p>`;
  if (result.key_points?.length) html += '<h4>关键要点</h4><ul>' + result.key_points.map(p => `<li>${esc(p)}</li>`).join('') + '</ul>';
  if (result.value_analysis) html += `<h4>价值分析</h4><p>${esc(result.value_analysis)}</p>`;
  if (result.freshness && result.freshness !== 'unknown') {
    const labels = { fresh: '🟢 新鲜', aging: '🟡 老化', outdated: '🔴 过时' };
    html += `<p>${labels[result.freshness] || result.freshness}</p>`;
  }

  thinkingEl.innerHTML = html;
  if (result.conversationId) enableFollowUp(body, result.conversationId, messagesEl);
}

export async function showGroupSummary(categoryId, categoryName) {
  toggleModal('summaryModal', true);
  $('#summaryTitle').textContent = `${categoryName} · 总结`;
  $('#summaryBody').innerHTML = '<div class="spinner" style="margin:20px auto"></div><p style="text-align:center;color:var(--c-text3)">正在生成分类总结...</p>';

  if (!state.backendConnected) { $('#summaryBody').innerHTML = '<p>需要后端连接</p>'; return; }

  const result = await backendPost(`/api/tabs/summarize-group/${categoryId}`, { model: getModel() });
  if (result.error) { $('#summaryBody').innerHTML = `<p>总结失败: ${esc(result.error)}</p>`; return; }

  let html = `<p>${esc(result.group_summary || '')}</p>`;
  if (result.themes?.length) html += '<h4>主题</h4><ul>' + result.themes.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>';
  if (result.priority_reads?.length) html += '<h4>推荐优先阅读</h4><ul>' + result.priority_reads.map(p => `<li>${esc(p.reason || p.id)}</li>`).join('') + '</ul>';
  if (result.duplicates?.length) html += '<h4>疑似重复</h4><ul>' + result.duplicates.map(d => `<li>${esc(d.reason)}</li>`).join('') + '</ul>';
  if (result.outdated?.length) html += '<h4>可能过时</h4><ul>' + result.outdated.map(o => `<li>${esc(o.reason || o.id)}</li>`).join('') + '</ul>';
  if (result.note_card) html += `<h4>笔记卡片</h4><div class="note-card">${esc(result.note_card)}</div>`;
  $('#summaryBody').innerHTML = html;
}

export async function batchSummarize() {
  const ids = [...state.selectedIds];
  if (!ids.length || !state.backendConnected) return;
  toggleModal('summaryModal', true);
  $('#summaryTitle').textContent = `批量总结 (${ids.length})`;
  $('#summaryBody').innerHTML = '<div class="spinner" style="margin:20px auto"></div>';

  let html = '';
  for (let i = 0; i < ids.length; i++) {
    const tab = state.tabs.find(t => t.id === ids[i]);
    if (!tab) continue;
    showProgress((i / ids.length) * 100, `总结 ${i + 1}/${ids.length}: ${(tab.title || '').slice(0, 20)}...`);
    const result = await backendPost(`/api/tabs/summarize/${ids[i]}`, { model: getModel() });
    html += `<h4>${esc(tab.title || '无标题')}</h4><p>${esc(result.summary || result.error || '无摘要')}</p>`;
  }
  hideProgress();
  $('#summaryBody').innerHTML = html || '<p>无结果</p>';
}
