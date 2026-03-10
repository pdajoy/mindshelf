import { focusTab, backendGet } from '../../lib/api-client.js';
import { state, $, esc, toast, toggleModal } from './state.js';

export async function viewGraph() {
  toggleModal('graphModal', true);
  const body = $('#graphBody');
  body.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';

  let data;
  if (state.backendConnected) {
    data = await backendGet('/api/tabs/tab-graph');
    if (data.error) data = null;
  }

  if (!data || !data.nodes?.length) {
    data = buildLocalGraph();
  }

  renderGraph(body, data);
}

function buildLocalGraph() {
  const tabs = state.tabs;
  const nodes = tabs.map(t => ({
    id: t.id,
    label: (t.title || '').slice(0, 30),
    domain: t.domain || 'unknown',
    url: t.url || '',
    topic: t.topic_id || t.domain || 'other',
    color: t.topic_id ? '#007AFF' : '#8E8E93',
    priority: t.priority_score || 0,
  }));

  const links = [];
  const byDomain = {};
  for (const t of tabs) {
    const d = t.domain || 'unknown';
    if (!byDomain[d]) byDomain[d] = [];
    byDomain[d].push(t.id);
  }
  for (const ids of Object.values(byDomain)) {
    if (ids.length < 2 || ids.length > 15) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        links.push({ source: ids[i], target: ids[j], type: 'same_domain', strength: 0.3 });
      }
    }
  }

  return { nodes, links, stats: { nodes: nodes.length, links: links.length } };
}

function renderGraph(container, { nodes, links }) {
  const W = container.clientWidth || 400;
  const H = container.clientHeight || 500;
  container.innerHTML = '';
  container.style.position = 'relative';

  if (!nodes.length) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--c-text3)">没有足够数据生成图谱，请先执行AI分类</div>';
    return;
  }

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute;pointer-events:none;background:var(--c-surface-solid);border:1px solid var(--c-border);border-radius:10px;padding:8px 12px;font-size:11px;color:var(--c-text);box-shadow:var(--shadow-lg);max-width:260px;opacity:0;transition:opacity 0.15s;z-index:10';
  container.appendChild(tooltip);

  const pos = nodes.map(() => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H / 2 + (Math.random() - 0.5) * H * 0.6, vx: 0, vy: 0 }));
  const nodeById = {};
  nodes.forEach((n, i) => { nodeById[n.id] = i; });

  const repulseStrength = Math.min(500, 120 + nodes.length * 0.6);
  const idealLen = Math.max(35, 100 - nodes.length * 0.15);
  const maxFrames = Math.min(600, 250 + nodes.length);
  const showLabels = nodes.length < 60;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || (window.matchMedia?.('(prefers-color-scheme: dark)').matches && document.documentElement.getAttribute('data-theme') !== 'light');

  const LINK_COLORS = { same_domain: '#007AFF', same_topic: isDark ? '#636366' : '#C7C7CC', duplicate: '#FF3B30' };
  let linkFilter = 'all';

  const filterSelect = document.getElementById('graphLinkFilter');
  if (filterSelect) {
    filterSelect.value = 'all';
    filterSelect.onchange = () => {
      linkFilter = filterSelect.value;
      frames = 0;
      animate();
    };
  }

  function getVisibleLinks() {
    if (linkFilter === 'all') return links;
    return links.filter(l => l.type === linkFilter);
  }

  function tick() {
    for (let i = 0; i < pos.length; i++) {
      pos[i].vx += (W / 2 - pos[i].x) * 0.0008;
      pos[i].vy += (H / 2 - pos[i].y) * 0.0008;
    }
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        let dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = repulseStrength / (dist * dist);
        pos[i].vx -= (dx / dist) * force;
        pos[i].vy -= (dy / dist) * force;
        pos[j].vx += (dx / dist) * force;
        pos[j].vy += (dy / dist) * force;
      }
    }
    const activeLinks = getVisibleLinks();
    for (const link of activeLinks) {
      const si = nodeById[link.source], ti = nodeById[link.target];
      if (si == null || ti == null) continue;
      let dx = pos[ti].x - pos[si].x, dy = pos[ti].y - pos[si].y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let force = (dist - idealLen) * 0.006 * (link.strength || 0.3);
      pos[si].vx += (dx / dist) * force;
      pos[si].vy += (dy / dist) * force;
      pos[ti].vx -= (dx / dist) * force;
      pos[ti].vy -= (dy / dist) * force;
    }
    const damping = 0.8;
    for (const p of pos) {
      p.vx *= damping; p.vy *= damping;
      p.x = Math.max(20, Math.min(W - 20, p.x + p.vx));
      p.y = Math.max(20, Math.min(H - 20, p.y + p.vy));
    }
  }

  function draw() {
    const bgColor = isDark ? '#1C1C1E' : '#F5F5F7';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const visibleLinks = getVisibleLinks();
    for (const link of visibleLinks) {
      const si = nodeById[link.source], ti = nodeById[link.target];
      if (si == null || ti == null) continue;
      const opacity = link.type === 'duplicate' ? 0.6 : link.type === 'same_domain' ? 0.4 : 0.2;
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(pos[si].x, pos[si].y);
      ctx.lineTo(pos[ti].x, pos[ti].y);
      ctx.strokeStyle = LINK_COLORS[link.type] || LINK_COLORS.same_topic;
      ctx.lineWidth = link.type === 'duplicate' ? 2 : (link.strength || 0.3) * 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const textColor = isDark ? '#F5F5F7' : '#1D1D1F';
    const textShadow = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], p = pos[i];
      const isHovered = (i === hoveredIdx);
      const baseR = Math.max(3, 3.5 + (n.priority || 0) * 3.5);
      const r = isHovered ? baseR * 1.6 : baseR;
      const color = n.color || '#007AFF';

      if (isHovered) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = isDark ? '#F5F5F7' : '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (showLabels || isHovered) {
        const fontSize = isHovered ? 10 : 8;
        ctx.font = `${isHovered ? '600' : '400'} ${fontSize}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = textShadow;
        ctx.fillText(n.label, p.x + 0.5, p.y + r + 11 + 0.5);
        ctx.fillStyle = textColor;
        ctx.fillText(n.label, p.x, p.y + r + 11);
      }
    }
  }

  let hoveredIdx = -1;
  let frames = 0;
  function animate() {
    if (frames > maxFrames) { draw(); return; }
    tick(); draw();
    frames++;
    requestAnimationFrame(animate);
  }
  animate();
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let closest = -1, minDist = 18;
    for (let i = 0; i < pos.length; i++) {
      const dx = pos[i].x - mx, dy = pos[i].y - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) { minDist = d; closest = i; }
    }
    if (closest !== hoveredIdx) {
      hoveredIdx = closest;
      draw();
      if (closest >= 0) {
        const n = nodes[closest];
        const linkedCount = links.filter(l => l.source === n.id || l.target === n.id).length;
        tooltip.innerHTML = `<div style="font-weight:600;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.label)}</div><div style="color:var(--c-text3);font-size:10px">${esc(n.domain)} · ${linkedCount} 个关系</div>`;
        const tipX = Math.min(pos[closest].x + 12, W - 220);
        const tipY = Math.max(pos[closest].y - 40, 8);
        tooltip.style.left = `${tipX}px`;
        tooltip.style.top = `${tipY}px`;
        tooltip.style.opacity = '1';
        canvas.style.cursor = 'pointer';
      } else {
        tooltip.style.opacity = '0';
        canvas.style.cursor = 'default';
      }
    }
  });

  canvas.addEventListener('click', () => {
    if (hoveredIdx >= 0) {
      const n = nodes[hoveredIdx];
      const tab = state.tabs.find(t => t.id === n.id);
      if (tab?.chromeTabId) focusTab(tab.chromeTabId);
      else window.open(n.url, '_blank');
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
    if (hoveredIdx >= 0) { hoveredIdx = -1; draw(); }
  });

  const domainCounts = {};
  for (const n of nodes) domainCounts[n.domain] = (domainCounts[n.domain] || 0) + 1;
  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const legend = document.createElement('div');
  legend.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:8px 12px;font-size:10px;color:var(--c-text2);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(transparent, var(--c-bg));pointer-events:none';
  legend.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:3px;background:#007AFF;border-radius:2px;display:inline-block"></span>同域名</span>
      <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:3px;background:${LINK_COLORS.same_topic};border-radius:2px;display:inline-block"></span>同分类</span>
      <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:3px;background:#FF3B30;border-radius:2px;display:inline-block"></span>重复</span>
    </div>
    <div style="text-align:right">${nodes.length} 个节点 · ${links.length} 条关系 · Top: ${topDomains.map(([d, c]) => `${d}(${c})`).join(', ')}</div>
  `;
  container.appendChild(legend);
}
