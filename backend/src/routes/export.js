import { Router } from 'express';
import { queries } from '../db.js';

export const exportRoutes = Router();

exportRoutes.get('/json', (_req, res) => {
  const tabs = queries.getActiveTabs.all();
  const categories = queries.getCategories.all();

  const grouped = {};
  for (const cat of categories) {
    grouped[cat.id] = { ...cat, tabs: [] };
  }
  grouped['uncategorized'] = { id: 'uncategorized', name: '未分类', color: '#9CA3AF', tabs: [] };

  for (const tab of tabs) {
    const key = tab.topic_id || tab.category_id || 'uncategorized';
    if (!grouped[key]) grouped[key] = { id: key, name: key, tabs: [] };
    grouped[key].tabs.push(tab);
  }

  const output = Object.values(grouped).filter(g => g.tabs.length > 0);

  res.json({
    exported_at: new Date().toISOString(),
    total_tabs: tabs.length,
    categories: output,
  });
});

exportRoutes.get('/markdown', (req, res) => {
  const tabs = queries.getActiveTabs.all();
  const categories = queries.getCategories.all();
  const format = req.query.format || 'full';

  const catMap = {};
  for (const cat of categories) catMap[cat.id] = cat;

  const grouped = {};
  for (const tab of tabs) {
    const catId = tab.topic_id || tab.category_id || 'uncategorized';
    if (!grouped[catId]) grouped[catId] = [];
    grouped[catId].push(tab);
  }

  let md = `# 浏览器标签整理报告\n\n`;
  md += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n`;
  md += `> 标签总数：${tabs.length}\n\n`;
  md += `---\n\n`;

  for (const [catId, catTabs] of Object.entries(grouped)) {
    const cat = catMap[catId] || { icon: '📌', name: catId };
    md += `## ${cat.icon} ${cat.name}（${catTabs.length}）\n\n`;

    for (const tab of catTabs) {
      md += `### [${tab.title || '无标题'}](${tab.url})\n`;
      md += `- 域名：\`${tab.domain}\`\n`;

      if (tab.summary && format === 'full') {
        md += `- 摘要：${tab.summary}\n`;
      }

      const age = tab.first_seen_at
        ? Math.floor((Date.now() - new Date(tab.first_seen_at).getTime()) / 86400000)
        : 0;
      if (age > 0) {
        md += `- 已打开：${age} 天\n`;
      }
      if (tab.reading_time_min > 0) {
        md += `- 预计阅读：${tab.reading_time_min} 分钟\n`;
      }
      md += '\n';
    }
    md += `---\n\n`;
  }

  if (req.query.download === 'true') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tabs-${Date.now()}.md"`);
  } else {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  }
  res.send(md);
});

exportRoutes.get('/notes', (_req, res) => {
  const tabs = queries.getActiveTabs.all();
  const categories = queries.getCategories.all();

  const catMap = {};
  for (const cat of categories) catMap[cat.id] = cat;

  const grouped = {};
  for (const tab of tabs) {
    const catId = tab.topic_id || tab.category_id || 'uncategorized';
    if (!grouped[catId]) grouped[catId] = [];
    grouped[catId].push(tab);
  }

  const cards = [];
  for (const [catId, catTabs] of Object.entries(grouped)) {
    const cat = catMap[catId] || { icon: '📌', name: catId };
    let card = `# ${cat.icon} ${cat.name}\n\n`;

    for (const tab of catTabs) {
      card += `**${tab.title || '无标题'}**\n`;
      card += `${tab.url}\n`;
      if (tab.summary) {
        card += `> ${tab.summary}\n`;
      }
      card += '\n';
    }

    cards.push({ category: cat.name, content: card });
  }

  res.json({
    exported_at: new Date().toISOString(),
    cards,
    combined: cards.map(c => c.content).join('\n---\n\n'),
  });
});
