import { queries, forceSave } from '../db.js';

const SESSION_WINDOW_MS = 30 * 60 * 1000; // 30 min
const MIN_TABS_FOR_SESSION = 3;

export function detectResearchSessions() {
  const tabs = queries.getActiveTabs.all();
  const sessions = [];

  const byTopic = new Map();
  for (const tab of tabs) {
    const key = tab.topic_id || tab.category_id || tab.domain || 'unknown';
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(tab);
  }

  for (const [topic, topicTabs] of byTopic) {
    if (topicTabs.length < MIN_TABS_FOR_SESSION) continue;

    const sorted = topicTabs
      .filter(t => t.first_seen_at)
      .sort((a, b) => new Date(a.first_seen_at).getTime() - new Date(b.first_seen_at).getTime());

    let cluster = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].first_seen_at).getTime();
      const curr = new Date(sorted[i].first_seen_at).getTime();
      if (curr - prev <= SESSION_WINDOW_MS) {
        cluster.push(sorted[i]);
      } else {
        if (cluster.length >= MIN_TABS_FOR_SESSION) {
          sessions.push(buildSession(topic, cluster));
        }
        cluster = [sorted[i]];
      }
    }
    if (cluster.length >= MIN_TABS_FOR_SESSION) {
      sessions.push(buildSession(topic, cluster));
    }
  }

  // Also detect by domain clusters
  const byDomain = new Map();
  const sessionTabIds = new Set(sessions.flatMap(s => s.tabIds));
  for (const tab of tabs) {
    if (sessionTabIds.has(tab.id)) continue;
    const d = tab.domain || 'unknown';
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(tab);
  }

  for (const [domain, domainTabs] of byDomain) {
    if (domainTabs.length < MIN_TABS_FOR_SESSION) continue;
    const sorted = domainTabs
      .filter(t => t.first_seen_at)
      .sort((a, b) => new Date(a.first_seen_at).getTime() - new Date(b.first_seen_at).getTime());

    let cluster = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].first_seen_at).getTime();
      const curr = new Date(sorted[i].first_seen_at).getTime();
      if (curr - prev <= SESSION_WINDOW_MS) {
        cluster.push(sorted[i]);
      } else {
        if (cluster.length >= MIN_TABS_FOR_SESSION) {
          sessions.push(buildSession(domain, cluster));
        }
        cluster = [sorted[i]];
      }
    }
    if (cluster.length >= MIN_TABS_FOR_SESSION) {
      sessions.push(buildSession(domain, cluster));
    }
  }

  return sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

function buildSession(topic, tabs) {
  const timestamps = tabs.map(t => new Date(t.first_seen_at).getTime());
  const domains = new Set(tabs.map(t => t.domain));
  return {
    topic,
    tabCount: tabs.length,
    tabIds: tabs.map(t => t.id),
    tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, domain: t.domain })),
    domains: [...domains],
    startedAt: new Date(Math.min(...timestamps)).toISOString(),
    endedAt: new Date(Math.max(...timestamps)).toISOString(),
    durationMin: Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 60000),
  };
}
