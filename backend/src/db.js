import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { config } from './config.js';

const DB_PATH = config.db.path.replace('.db', '.json');
const SCHEMA_VERSION = 2;
mkdirSync(dirname(DB_PATH), { recursive: true });

const defaultData = {
  _schemaVersion: SCHEMA_VERSION,
  tabs: {},
  classification_feedback: [],
  weekly_reports: [],
  categories: {
    tech: { id: 'tech', name: '技术/编程', color: '#4F46E5', icon: '💻', sort_order: 0 },
    research: { id: 'research', name: '研究/学术', color: '#10B981', icon: '🔬', sort_order: 1 },
    news: { id: 'news', name: '新闻/资讯', color: '#EF4444', icon: '📰', sort_order: 2 },
    design: { id: 'design', name: '设计/创意', color: '#EC4899', icon: '🎨', sort_order: 3 },
    business: { id: 'business', name: '商业/金融', color: '#F59E0B', icon: '💼', sort_order: 4 },
    entertainment: { id: 'entertainment', name: '娱乐/视频', color: '#8B5CF6', icon: '🎬', sort_order: 5 },
    social: { id: 'social', name: '社交/论坛', color: '#06B6D4', icon: '💬', sort_order: 6 },
    shopping: { id: 'shopping', name: '购物/电商', color: '#F97316', icon: '🛒', sort_order: 7 },
    reference: { id: 'reference', name: '参考/文档', color: '#6366F1', icon: '📚', sort_order: 8 },
    tools: { id: 'tools', name: '工具/服务', color: '#14B8A6', icon: '🔧', sort_order: 9 },
    other: { id: 'other', name: '其他', color: '#6B7280', icon: '📌', sort_order: 10 },
  },
  duplicate_clusters: {},
  sessions: {},
  settings: {},
};

let data;

function migrateV1toV2(d) {
  for (const tab of Object.values(d.tabs || {})) {
    if (tab.category_id && !tab.topic_id) {
      tab.topic_id = tab.category_id;
      tab.topic_confidence = 0.7;
      tab.topic_source = 'rule';
    }
    if (!Array.isArray(tab.facets)) tab.facets = [];
    if (tab.priority != null && tab.priority_score == null) {
      tab.priority_score = Math.min(1, Math.max(0, tab.priority / 10));
    }
    if (tab.stale_days == null) tab.stale_days = 0;
    if (tab.is_frozen == null) tab.is_frozen = false;
    if (tab.freshness_score == null) tab.freshness_score = null;
    if (tab.duplicate_cluster_id == null) tab.duplicate_cluster_id = null;
    if (tab.profile_match == null) tab.profile_match = null;
    if (tab.read_intent == null) tab.read_intent = null;
    if (tab.ai_recommendation == null) tab.ai_recommendation = null;
    if (tab.user_decision == null) tab.user_decision = null;
    if (tab.decided_at == null) tab.decided_at = null;
  }
  if (!d.duplicate_clusters) d.duplicate_clusters = {};
  d._schemaVersion = SCHEMA_VERSION;
}

function cleanStaleDuplicateFacets() {
  const tabs = data.tabs || {};
  const clusterActive = {};
  for (const t of Object.values(tabs)) {
    const cid = t.duplicate_cluster_id;
    if (!cid || t.status !== 'active') continue;
    if (!clusterActive[cid]) clusterActive[cid] = [];
    clusterActive[cid].push(t);
  }
  let fixed = 0;
  for (const [cid, members] of Object.entries(clusterActive)) {
    if (members.length > 1) continue;
    for (const m of members) {
      if (Array.isArray(m.facets) && m.facets.includes('duplicate')) {
        m.facets = m.facets.filter(f => f !== 'duplicate');
        fixed++;
      }
    }
  }
  if (fixed) {
    console.log(`[DB] Cleaned ${fixed} stale duplicate facets at startup`);
    save();
  }
}

function load() {
  if (existsSync(DB_PATH)) {
    try {
      data = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
      if (!data.tabs) data.tabs = {};
      if (!data.categories) data.categories = defaultData.categories;
      if (!data.duplicate_clusters) data.duplicate_clusters = {};
      if (!data.sessions) data.sessions = {};
      if (!data.settings) data.settings = {};
      if (!data.classification_feedback) data.classification_feedback = [];
      if (!data.weekly_reports) data.weekly_reports = [];

      if ((data._schemaVersion || 1) < SCHEMA_VERSION) {
        console.log(`[DB] Migrating schema v${data._schemaVersion || 1} → v${SCHEMA_VERSION}`);
        migrateV1toV2(data);
        save();
      }
      cleanStaleDuplicateFacets();
    } catch {
      data = structuredClone(defaultData);
    }
  } else {
    data = structuredClone(defaultData);
  }
}

function save() {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

load();

function now() {
  return new Date().toISOString();
}

export const queries = {
  findByUrl(url) {
    if (!url) return null;
    return Object.values(data.tabs).find(t => t.url === url && t.status === 'active') || null;
  },

  findClosedByUrl(url) {
    if (!url) return null;
    const matches = Object.values(data.tabs)
      .filter(t => t.url === url && t.status === 'closed' && t.topic_id)
      .sort((a, b) => (b.closed_at || '').localeCompare(a.closed_at || ''));
    return matches[0] || null;
  },

  upsertTab(params) {
    const existing = data.tabs[params.id];
    const donor = !existing?.topic_id && params.url ? queries.findClosedByUrl(params.url) : null;
    const src = existing || donor;

    data.tabs[params.id] = {
      id: params.id,
      chrome_tab_id: params.chromeTabId || 0,
      url: params.url || '',
      title: params.title || '',
      domain: params.domain || '',
      favicon_url: params.faviconUrl || '',

      category_id: src?.category_id || null,
      topic_id: src?.topic_id || src?.category_id || null,
      topic_confidence: src?.topic_confidence ?? null,
      topic_source: src?.topic_source || null,

      facets: existing?.facets || donor?.facets?.filter(f => f !== 'duplicate') || [],
      duplicate_cluster_id: existing?.duplicate_cluster_id || null,
      freshness_score: src?.freshness_score ?? null,
      stale_days: existing?.stale_days || 0,
      is_frozen: params.isFrozen ?? existing?.is_frozen ?? false,

      priority_score: src?.priority_score ?? 0,
      profile_match: src?.profile_match ?? null,
      read_intent: src?.read_intent || null,
      ai_recommendation: src?.ai_recommendation || null,

      user_decision: existing?.user_decision || null,
      decided_at: existing?.decided_at || null,

      content: src?.content || '',
      summary: src?.summary || '',
      status: 'active',
      priority: src?.priority || 0,
      reading_time_min: src?.reading_time_min || 0,
      first_seen_at: existing?.first_seen_at || donor?.first_seen_at || now(),
      last_visited_at: now(),
      closed_at: null,
      close_context: existing?.close_context || '',
      meta: existing?.meta || '{}',
    };
    save();
  },

  updateTabCategory(categoryId, tabId) {
    if (data.tabs[tabId]) {
      data.tabs[tabId].category_id = categoryId;
      data.tabs[tabId].topic_id = categoryId;
      save();
    }
  },
  updateTabTopic(tabId, { topicId, confidence, source }) {
    const tab = data.tabs[tabId];
    if (!tab) return;
    tab.topic_id = topicId;
    tab.category_id = topicId;
    tab.topic_confidence = confidence ?? tab.topic_confidence;
    tab.topic_source = source || tab.topic_source;
    save();
  },
  updateTabFacets(tabId, { add = [], remove = [] } = {}) {
    const tab = data.tabs[tabId];
    if (!tab) return;
    if (!Array.isArray(tab.facets)) tab.facets = [];
    for (const f of remove) {
      const idx = tab.facets.indexOf(f);
      if (idx !== -1) tab.facets.splice(idx, 1);
    }
    for (const f of add) {
      if (!tab.facets.includes(f)) tab.facets.push(f);
    }
    save();
  },
  setTabFacets(tabId, facets) {
    const tab = data.tabs[tabId];
    if (!tab) return;
    tab.facets = Array.isArray(facets) ? facets : [];
    save();
  },
  updateTabDecision(tabId, { decision, recommendation } = {}) {
    const tab = data.tabs[tabId];
    if (!tab) return;
    if (decision != null) { tab.user_decision = decision; tab.decided_at = now(); }
    if (recommendation != null) tab.ai_recommendation = recommendation;
    save();
  },
  updateTabSummary(summary, tabId) {
    if (data.tabs[tabId]) { data.tabs[tabId].summary = summary; save(); }
  },
  updateTabContent(content, tabId) {
    if (data.tabs[tabId]) { data.tabs[tabId].content = content; save(); }
  },
  updateTabStatus(status, _statusForClosed, tabId) {
    if (data.tabs[tabId]) {
      data.tabs[tabId].status = status;
      if (status === 'closed') data.tabs[tabId].closed_at = now();
      save();
    }
  },
  updateTabPriority(priority, tabId) {
    if (data.tabs[tabId]) { data.tabs[tabId].priority = priority; save(); }
  },
  updateTabReadingTime(minutes, tabId) {
    if (data.tabs[tabId]) { data.tabs[tabId].reading_time_min = minutes; save(); }
  },
  updateTabCloseContext(context, tabId) {
    if (data.tabs[tabId]) { data.tabs[tabId].close_context = context; save(); }
  },

  getTab: { get(id) { return data.tabs[id] || null; } },
  getActiveTabs: {
    all() {
      return Object.values(data.tabs)
        .filter(t => t.status === 'active')
        .sort((a, b) => (b.last_visited_at || '').localeCompare(a.last_visited_at || ''));
    },
  },
  getTabsByCategory: {
    all(categoryId) {
      return Object.values(data.tabs)
        .filter(t => (t.topic_id === categoryId || t.category_id === categoryId) && t.status === 'active')
        .sort((a, b) => (b.priority_score || b.priority || 0) - (a.priority_score || a.priority || 0) || (b.last_visited_at || '').localeCompare(a.last_visited_at || ''));
    },
  },
  getTabsByStatus: {
    all(status) {
      return Object.values(data.tabs)
        .filter(t => t.status === status)
        .sort((a, b) => (b.last_visited_at || '').localeCompare(a.last_visited_at || ''));
    },
  },
  getAllTabs: {
    all() {
      return Object.values(data.tabs)
        .sort((a, b) => (b.last_visited_at || '').localeCompare(a.last_visited_at || ''));
    },
  },
  searchTabs: {
    all(q1) {
      const term = (q1 || '').toLowerCase();
      return Object.values(data.tabs).filter(t =>
        (t.title || '').toLowerCase().includes(term) ||
        (t.url || '').toLowerCase().includes(term) ||
        (t.summary || '').toLowerCase().includes(term)
      );
    },
  },

  getTabsByFacet: {
    all(facet) {
      return Object.values(data.tabs)
        .filter(t => t.status === 'active' && Array.isArray(t.facets) && t.facets.includes(facet))
        .sort((a, b) => (b.last_visited_at || '').localeCompare(a.last_visited_at || ''));
    },
  },
  getTabsFiltered({ topic, facets = [], status = 'active' } = {}) {
    return Object.values(data.tabs).filter(t => {
      if (status && t.status !== status) return false;
      if (topic && t.topic_id !== topic && t.category_id !== topic) return false;
      for (const f of facets) {
        if (!Array.isArray(t.facets) || !t.facets.includes(f)) return false;
      }
      return true;
    }).sort((a, b) => (b.last_visited_at || '').localeCompare(a.last_visited_at || ''));
  },
  getFacetStats() {
    const counts = {};
    for (const tab of Object.values(data.tabs)) {
      if (tab.status !== 'active') continue;
      for (const f of (tab.facets || [])) {
        counts[f] = (counts[f] || 0) + 1;
      }
    }
    return counts;
  },

  upsertDuplicateCluster(id, { canonicalUrl, tabIds }) {
    data.duplicate_clusters[id] = {
      id,
      canonical_url: canonicalUrl,
      tab_ids: tabIds || [],
      created_at: data.duplicate_clusters[id]?.created_at || now(),
    };
    save();
  },
  getDuplicateClusters() {
    return Object.values(data.duplicate_clusters);
  },
  deleteDuplicateCluster(id) {
    delete data.duplicate_clusters[id];
    save();
  },
  clearDuplicateClusters() {
    data.duplicate_clusters = {};
    save();
  },

  getCategories: {
    all() {
      const cats = Object.values(data.categories).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      return cats.map(c => {
        const tabCount = Object.values(data.tabs).filter(t =>
          (t.topic_id === c.id || t.category_id === c.id) && t.status === 'active'
        ).length;
        return { ...c, tab_count: tabCount };
      });
    },
  },
  getCategory: { get(id) { return data.categories[id] || null; } },
  upsertCategory(id, name, color, icon, sortOrder) {
    data.categories[id] = { id, name, color, icon, sort_order: sortOrder };
    save();
  },
  deleteCategory(id) {
    delete data.categories[id];
    save();
  },

  saveSession(id, name, tabSnapshot) {
    data.sessions[id] = { id, name, tab_snapshot: tabSnapshot, created_at: now() };
    save();
  },
  getSessions: {
    all() {
      return Object.values(data.sessions).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    },
  },
  getSession: { get(id) { return data.sessions[id] || null; } },
  deleteSession(id) {
    delete data.sessions[id];
    save();
  },

  getSetting: { get(key) { return data.settings[key] ? { value: data.settings[key] } : null; } },
  setSetting(key, value) {
    data.settings[key] = value;
    save();
  },

  addClassificationFeedback(feedback) {
    data.classification_feedback.push({ ...feedback, timestamp: now() });
    if (data.classification_feedback.length > 1000) {
      data.classification_feedback = data.classification_feedback.slice(-500);
    }
    save();
  },
  getClassificationFeedback() {
    return data.classification_feedback || [];
  },
  getClassificationPreferences() {
    const prefs = {};
    for (const fb of (data.classification_feedback || [])) {
      const key = `${fb.domain}::${fb.fromCategory}`;
      if (!prefs[key]) prefs[key] = { domain: fb.domain, from: fb.fromCategory, to: {}, count: 0 };
      prefs[key].to[fb.toCategory] = (prefs[key].to[fb.toCategory] || 0) + 1;
      prefs[key].count++;
    }
    return Object.values(prefs)
      .filter(p => p.count >= 2)
      .map(p => {
        const topTo = Object.entries(p.to).sort((a, b) => b[1] - a[1])[0];
        return { domain: p.domain, from: p.from, preferredCategory: topTo[0], count: p.count };
      });
  },

  addWeeklyReport(report) {
    data.weekly_reports.push(report);
    if (data.weekly_reports.length > 52) data.weekly_reports.shift();
    save();
  },
  getWeeklyReports() {
    return data.weekly_reports || [];
  },

  deleteTab(id) {
    delete data.tabs[id];
    save();
  },
  clearClosedTabs() {
    for (const [id, tab] of Object.entries(data.tabs)) {
      if (tab.status === 'closed') delete data.tabs[id];
    }
    save();
  },

  getStats: {
    get() {
      const tabs = Object.values(data.tabs);
      return {
        total: tabs.length,
        active: tabs.filter(t => t.status === 'active').length,
        closed: tabs.filter(t => t.status === 'closed').length,
        archived: tabs.filter(t => t.status === 'archived').length,
        categories_used: new Set(tabs.filter(t => t.topic_id || t.category_id).map(t => t.topic_id || t.category_id)).size,
        unique_domains: new Set(tabs.map(t => t.domain)).size,
      };
    },
  },
};

export function runTransaction(fn) {
  return fn();
}

export function forceSave() {
  save();
}

export default data;
