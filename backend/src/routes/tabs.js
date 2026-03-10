import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queries, runTransaction, forceSave } from '../db.js';
import { categorizeTabs, applyCategorizations, getCategoryDefinitions } from '../services/categorizer.js';
import { detectResearchSessions } from '../services/research-session.js';
import { summarizeTab, summarizeGroup, followUp, summarizeTabStream, followUpStream } from '../services/summarizer.js';
import { analyzeTabs } from '../services/analyzer.js';
import { getAvailableModels } from '../services/ai-provider.js';
import { getLogs, clearLogs } from '../services/api-logger.js';

export const tabRoutes = Router();

tabRoutes.get('/', (req, res) => {
  const { facets, topic } = req.query;
  if (facets || topic) {
    const facetList = facets ? facets.split(',').filter(Boolean) : [];
    const tabs = queries.getTabsFiltered({ topic: topic || null, facets: facetList });
    return res.json({ tabs });
  }
  const tabs = queries.getActiveTabs.all();
  res.json({ tabs });
});

tabRoutes.get('/all', (_req, res) => {
  const tabs = queries.getAllTabs.all();
  res.json({ tabs });
});

tabRoutes.get('/categories', (_req, res) => {
  const categories = queries.getCategories.all();
  res.json({ categories });
});

tabRoutes.get('/stats', (_req, res) => {
  const stats = queries.getStats.get();
  res.json(stats);
});

tabRoutes.get('/analysis', (_req, res) => {
  const tabs = queries.getActiveTabs.all();
  const result = analyzeTabs(tabs);
  res.json(result);
});

tabRoutes.get('/models', (_req, res) => {
  res.json({ models: getAvailableModels() });
});

tabRoutes.get('/api-logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  res.json(getLogs(limit, offset));
});

tabRoutes.delete('/api-logs', (_req, res) => {
  clearLogs();
  res.json({ ok: true });
});

tabRoutes.get('/search', (req, res) => {
  const q = req.query.q || '';
  const tabs = queries.searchTabs.all(q);
  res.json({ tabs });
});

tabRoutes.get('/sessions/list', (_req, res) => {
  const sessions = queries.getSessions.all();
  res.json({
    sessions: sessions.map(s => ({
      ...s,
      tab_snapshot: typeof s.tab_snapshot === 'string' ? JSON.parse(s.tab_snapshot) : s.tab_snapshot,
    })),
  });
});

tabRoutes.post('/sync', (req, res) => {
  const { tabs } = req.body;
  if (!Array.isArray(tabs)) return res.status(400).json({ error: 'tabs must be an array' });

  const syncedIds = new Set();
  const results = runTransaction(() => {
    return tabs.map(t => {
      const id = t.id || uuidv4();
      const domain = extractDomain(t.url);
      queries.upsertTab({
        id,
        chromeTabId: t.chromeTabId || 0,
        url: t.url || '',
        title: t.title || '',
        domain,
        faviconUrl: t.faviconUrl || '',
        isFrozen: !!t.discarded,
      });
      syncedIds.add(id);
      return id;
    });
  });

  // Mark tabs NOT in this sync as closed (they're no longer open in the browser)
  const allActive = queries.getActiveTabs.all();
  const closedDuringSync = [];
  for (const tab of allActive) {
    if (!syncedIds.has(tab.id)) {
      tab.status = 'closed';
      tab.closed_at = new Date().toISOString();
      if (tab.duplicate_cluster_id) closedDuringSync.push(tab.duplicate_cluster_id);
    }
  }

  // Re-evaluate duplicate clusters: if only 1 active tab remains in a cluster, clear the duplicate facet
  if (closedDuringSync.length) {
    const affectedClusters = new Set(closedDuringSync);
    const remainingActive = queries.getActiveTabs.all();
    for (const clusterId of affectedClusters) {
      const clusterMembers = remainingActive.filter(t => t.duplicate_cluster_id === clusterId);
      if (clusterMembers.length <= 1) {
        for (const member of clusterMembers) {
          member.facets = (member.facets || []).filter(f => f !== 'duplicate');
          if (!member.facets.length) delete member.duplicate_cluster_id;
        }
      }
    }
  }

  const staleDaysThreshold = 30;
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    const id = results[i];
    const tab = queries.getTab.get(id);
    if (!tab) continue;

    tab.stale_days = tab.first_seen_at
      ? Math.floor((Date.now() - new Date(tab.first_seen_at).getTime()) / 86400000)
      : 0;
    tab.is_frozen = !!t.discarded;

    if (t.lastAccessed) {
      const lastAccessedMs = typeof t.lastAccessed === 'number' ? t.lastAccessed : new Date(t.lastAccessed).getTime();
      const hoursSinceAccess = (Date.now() - lastAccessedMs) / 3600000;
      tab.is_frozen = t.discarded || hoursSinceAccess > 72;
      tab._lastAccessed = lastAccessedMs;
    }

    const newFacets = new Set(tab.facets || []);
    if (tab.stale_days > staleDaysThreshold) newFacets.add('outdated');
    else newFacets.delete('outdated');
    if (tab.is_frozen) newFacets.add('frozen');
    else newFacets.delete('frozen');
    tab.facets = [...newFacets];
  }
  forceSave();

  res.json({ synced: results.length, ids: results });
});

tabRoutes.post('/mark-closed-by-chrome-id', (req, res) => {
  const { chromeTabId } = req.body;
  if (!chromeTabId) return res.status(400).json({ error: 'chromeTabId required' });

  const allActive = queries.getActiveTabs.all();
  const tab = allActive.find(t => t.chrome_tab_id === chromeTabId);
  if (tab) {
    queries.updateTabStatus('closed', 'closed', tab.id);
  }
  res.json({ ok: true, found: !!tab });
});

tabRoutes.post('/content', (req, res) => {
  const { tabId, content } = req.body;
  if (!tabId || !content) return res.status(400).json({ error: 'tabId and content required' });

  queries.updateTabContent(content, tabId);
  res.json({ ok: true });
});

tabRoutes.get('/categorize-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const model = req.query.model || undefined;
  const tabIdsParam = req.query.tabIds;
  const filterIds = tabIdsParam ? new Set(tabIdsParam.split(',')) : null;

  try {
    let tabs = queries.getActiveTabs.all();
    if (filterIds) tabs = tabs.filter(t => filterIds.has(t.id));
    if (tabs.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'done', message: 'No active tabs' })}\n\n`);
      res.end();
      return;
    }

    const defs = getCategoryDefinitions();
    res.write(`data: ${JSON.stringify({ type: 'start', total: tabs.length, categoryDefs: defs })}\n\n`);

    const result = await categorizeTabs(tabs, {
      model,
      onProgress: (progress) => {
        res.write(`data: ${JSON.stringify({ type: 'stage', ...progress })}\n\n`);
      },
    });

    applyCategorizations(result);
    scorePriorities();
    const categories = queries.getCategories.all();
    const updatedTabs = queries.getActiveTabs.all();
    const facetStats = queries.getFacetStats();

    res.write(`data: ${JSON.stringify({
      type: 'done',
      categorizations: result.classifications || result,
      categories,
      tabs: updatedTabs,
      facetStats,
      dupClusters: Object.keys(result.dupClusters || {}).length,
    })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }
  res.end();
});

tabRoutes.post('/categorize', async (req, res, next) => {
  try {
    const model = req.body?.model || undefined;
    const tabIds = req.body?.tabIds;
    let tabs = queries.getActiveTabs.all();
    if (Array.isArray(tabIds) && tabIds.length > 0) {
      const idSet = new Set(tabIds);
      tabs = tabs.filter(t => idSet.has(t.id));
    }
    if (tabs.length === 0) return res.json({ message: 'No active tabs', categorizations: {} });

    const result = await categorizeTabs(tabs, { model });
    applyCategorizations(result);

    const categories = queries.getCategories.all();
    const updatedTabs = queries.getActiveTabs.all();
    const facetStats = queries.getFacetStats();

    res.json({
      categorizations: result.classifications || result,
      categories,
      tabs: updatedTabs,
      facetStats,
    });
  } catch (err) {
    next(err);
  }
});

tabRoutes.get('/summarize-stream/:id', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const tab = queries.getTab.get(req.params.id);
  if (!tab) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Tab not found' })}\n\n`);
    res.end();
    return;
  }

  const detailed = req.query.detailed === 'true';
  const model = req.query.model || undefined;

  try {
    for await (const chunk of summarizeTabStream(tab, { detailed, model })) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }
  res.end();
});

tabRoutes.get('/follow-up-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const { conversationId, question, model } = req.query;
  if (!conversationId || !question) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'conversationId and question required' })}\n\n`);
    res.end();
    return;
  }

  try {
    for await (const chunk of followUpStream(conversationId, question, { model })) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }
  res.end();
});

tabRoutes.post('/summarize/:id', async (req, res, next) => {
  try {
    const tab = queries.getTab.get(req.params.id);
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    const detailed = req.body?.detailed === true;
    const model = req.body?.model || undefined;
    const result = await summarizeTab(tab, { detailed, model });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tabRoutes.post('/follow-up', async (req, res, next) => {
  try {
    const { conversationId, question, model } = req.body;
    if (!conversationId || !question) {
      return res.status(400).json({ error: 'conversationId and question required' });
    }
    const result = await followUp(conversationId, question, { model });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tabRoutes.post('/summarize-group/:categoryId', async (req, res, next) => {
  try {
    const model = req.body?.model || undefined;
    const result = await summarizeGroup(req.params.categoryId, { model });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tabRoutes.post('/score-priority', async (req, res) => {
  try {
    const tabs = queries.getActiveTabs.all();
    if (!tabs.length) return res.json({ scored: 0 });

    const now = Date.now();
    for (const tab of tabs) {
      let score = 0.5;

      const ageDays = tab.first_seen_at ? (now - new Date(tab.first_seen_at).getTime()) / 86400000 : 0;
      const ageFactor = ageDays < 1 ? 0.9 : ageDays < 7 ? 0.7 : ageDays < 30 ? 0.4 : 0.2;
      score = score * 0.3 + ageFactor * 0.3;

      const freshness = tab.freshness_score ?? 0.5;
      score += freshness * 0.2;

      const recMap = { keep: 0.8, bookmark: 0.7, snooze: 0.4, close: 0.1 };
      const recScore = recMap[tab.ai_recommendation] ?? 0.5;
      score += recScore * 0.2;

      const hasDup = (tab.facets || []).includes('duplicate');
      if (hasDup) score *= 0.6;
      if (tab.is_frozen) score *= 0.7;

      tab.priority_score = Math.min(1, Math.max(0, Math.round(score * 100) / 100));
    }
    forceSave();

    res.json({ scored: tabs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

tabRoutes.get('/facet-stats', (_req, res) => {
  const stats = queries.getFacetStats();
  res.json({ facets: stats });
});

tabRoutes.get('/research-sessions', (_req, res) => {
  const sessions = detectResearchSessions();
  res.json({ sessions, count: sessions.length });
});

tabRoutes.get('/tab-graph', (_req, res) => {
  const tabs = queries.getActiveTabs.all();
  const nodes = [];
  const links = [];
  const catColors = {};
  const cats = queries.getCategories.all();
  for (const c of cats) catColors[c.id] = c.color || '#6B7280';

  for (const tab of tabs) {
    nodes.push({
      id: tab.id,
      label: (tab.title || '').slice(0, 30),
      domain: tab.domain,
      url: tab.url,
      topic: tab.topic_id || tab.category_id || 'other',
      color: catColors[tab.topic_id || tab.category_id] || '#6B7280',
      priority: tab.priority_score || 0,
    });
  }

  // Same-domain links
  const byDomain = {};
  for (const tab of tabs) {
    if (!byDomain[tab.domain]) byDomain[tab.domain] = [];
    byDomain[tab.domain].push(tab.id);
  }
  for (const ids of Object.values(byDomain)) {
    if (ids.length < 2 || ids.length > 10) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        links.push({ source: ids[i], target: ids[j], type: 'same_domain', strength: 0.3 });
      }
    }
  }

  // Same-topic links (lighter)
  const byTopic = {};
  for (const tab of tabs) {
    const t = tab.topic_id || tab.category_id;
    if (!t) continue;
    if (!byTopic[t]) byTopic[t] = [];
    byTopic[t].push(tab.id);
  }
  for (const ids of Object.values(byTopic)) {
    if (ids.length < 2 || ids.length > 20) continue;
    for (let i = 0; i < Math.min(ids.length, 8); i++) {
      for (let j = i + 1; j < Math.min(ids.length, 8); j++) {
        const existing = links.find(l =>
          (l.source === ids[i] && l.target === ids[j]) || (l.source === ids[j] && l.target === ids[i])
        );
        if (!existing) {
          links.push({ source: ids[i], target: ids[j], type: 'same_topic', strength: 0.15 });
        }
      }
    }
  }

  // Duplicate cluster links (strong)
  const clusters = queries.getDuplicateClusters();
  for (const cluster of clusters) {
    const ids = cluster.tab_ids || [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const existing = links.find(l =>
          (l.source === ids[i] && l.target === ids[j]) || (l.source === ids[j] && l.target === ids[i])
        );
        if (existing) existing.strength = 0.8;
        else links.push({ source: ids[i], target: ids[j], type: 'duplicate', strength: 0.8 });
      }
    }
  }

  res.json({ nodes, links, stats: { nodes: nodes.length, links: links.length } });
});

tabRoutes.get('/duplicate-clusters', (_req, res) => {
  const clusters = queries.getDuplicateClusters();
  res.json({ clusters });
});

// IMPORTANT: /:id must be AFTER all specific GET routes to avoid matching "models", "api-logs", etc.
tabRoutes.get('/:id', (req, res) => {
  const tab = queries.getTab.get(req.params.id);
  if (!tab) return res.status(404).json({ error: 'Tab not found' });
  res.json(tab);
});

tabRoutes.patch('/:id/status', (req, res) => {
  const { status, context } = req.body;
  const valid = ['active', 'snoozed', 'archived', 'closed'];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });

  queries.updateTabStatus(status, status, req.params.id);
  if (context && status === 'closed') {
    queries.updateTabCloseContext(context, req.params.id);
  }
  res.json({ ok: true });
});

tabRoutes.patch('/:id/category', (req, res) => {
  const { categoryId } = req.body;
  const tab = queries.getTab.get(req.params.id);
  if (tab) {
    const oldCategory = tab.topic_id || tab.category_id;
    if (oldCategory && oldCategory !== categoryId) {
      queries.addClassificationFeedback({
        tabId: req.params.id,
        domain: tab.domain || '',
        fromCategory: oldCategory,
        toCategory: categoryId,
      });
    }
  }
  queries.updateTabCategory(categoryId, req.params.id);
  res.json({ ok: true });
});

tabRoutes.post('/classification-feedback', (req, res) => {
  const { tabId, domain, fromCategory, toCategory } = req.body;
  if (!tabId || !toCategory) return res.status(400).json({ error: 'tabId and toCategory required' });
  queries.addClassificationFeedback({ tabId, domain: domain || '', fromCategory: fromCategory || '', toCategory });
  res.json({ ok: true });
});

tabRoutes.get('/classification-preferences', (_req, res) => {
  const prefs = queries.getClassificationPreferences();
  res.json({ preferences: prefs });
});

tabRoutes.get('/weekly-report', (_req, res) => {
  const tabs = queries.getAllTabs.all();
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;

  const thisWeek = tabs.filter(t => new Date(t.first_seen_at || 0).getTime() > weekAgo);
  const closedThisWeek = tabs.filter(t => t.status === 'closed' && new Date(t.closed_at || 0).getTime() > weekAgo);
  const activeTabs = tabs.filter(t => t.status === 'active');
  const stalest = activeTabs.sort((a, b) => {
    const aDays = a.first_seen_at ? (now - new Date(a.first_seen_at).getTime()) / 86400000 : 0;
    const bDays = b.first_seen_at ? (now - new Date(b.first_seen_at).getTime()) / 86400000 : 0;
    return bDays - aDays;
  }).slice(0, 5);

  const topicCounts = {};
  for (const t of thisWeek) {
    const topic = t.topic_id || t.category_id || 'other';
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  }

  const report = {
    period: { from: new Date(weekAgo).toISOString(), to: new Date().toISOString() },
    newTabs: thisWeek.length,
    closedTabs: closedThisWeek.length,
    activeTabs: activeTabs.length,
    topTopics: Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic, count]) => ({ topic, count })),
    stalestTabs: stalest.map(t => ({
      id: t.id,
      title: (t.title || '').slice(0, 50),
      domain: t.domain,
      ageDays: t.first_seen_at ? Math.floor((now - new Date(t.first_seen_at).getTime()) / 86400000) : 0,
    })),
  };
  res.json(report);
});

tabRoutes.get('/weekly-reports', (_req, res) => {
  res.json({ reports: queries.getWeeklyReports() });
});

tabRoutes.patch('/:id/topic', (req, res) => {
  const { topicId, confidence, source } = req.body;
  if (!topicId) return res.status(400).json({ error: 'topicId required' });
  queries.updateTabTopic(req.params.id, { topicId, confidence, source });
  res.json({ ok: true });
});

tabRoutes.patch('/:id/facets', (req, res) => {
  const { add, remove } = req.body;
  queries.updateTabFacets(req.params.id, { add, remove });
  const tab = queries.getTab.get(req.params.id);
  res.json({ ok: true, facets: tab?.facets || [] });
});

tabRoutes.patch('/:id/decision', (req, res) => {
  const { decision, recommendation } = req.body;
  queries.updateTabDecision(req.params.id, { decision, recommendation });
  res.json({ ok: true });
});

tabRoutes.delete('/:id', (req, res) => {
  queries.deleteTab(req.params.id);
  res.json({ ok: true });
});

tabRoutes.post('/close-batch', (req, res) => {
  const { tabIds, context } = req.body;
  if (!Array.isArray(tabIds)) return res.status(400).json({ error: 'tabIds must be an array' });

  runTransaction(() => {
    for (const id of tabIds) {
      queries.updateTabStatus('closed', 'closed', id);
      if (context) queries.updateTabCloseContext(context, id);
    }
  });
  res.json({ closed: tabIds.length });
});

tabRoutes.post('/sessions', (req, res) => {
  const { name } = req.body;
  const tabs = queries.getActiveTabs.all();
  const id = uuidv4();
  queries.saveSession(id, name || `Session ${new Date().toLocaleDateString()}`, JSON.stringify(tabs));
  res.json({ id, tabCount: tabs.length });
});

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function scorePriorities() {
  const tabs = queries.getActiveTabs.all();
  const now = Date.now();
  for (const tab of tabs) {
    let score = 0.5;
    const ageDays = tab.first_seen_at ? (now - new Date(tab.first_seen_at).getTime()) / 86400000 : 0;
    const ageFactor = ageDays < 1 ? 0.9 : ageDays < 7 ? 0.7 : ageDays < 30 ? 0.4 : 0.2;
    score = score * 0.3 + ageFactor * 0.3;
    score += (tab.freshness_score ?? 0.5) * 0.2;
    const recMap = { keep: 0.8, bookmark: 0.7, snooze: 0.4, close: 0.1 };
    score += (recMap[tab.ai_recommendation] ?? 0.5) * 0.2;
    if ((tab.facets || []).includes('duplicate')) score *= 0.6;
    if (tab.is_frozen) score *= 0.7;
    tab.priority_score = Math.min(1, Math.max(0, Math.round(score * 100) / 100));
  }
  forceSave();
}
