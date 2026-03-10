const TRACKING_PARAM_RE = /^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$|ref$|ref_src$|spm$)/i;
const GENERIC_TITLE_RE = /^(home|homepage|index|dashboard|new tab|untitled|登录|首页|主页|设置|详情|文章|列表|profile)$/i;

function isDynamicSegment(seg) {
  if (!seg) return false;
  if (/^\d+$/.test(seg)) return true;
  if (/^[0-9a-f]{8,}$/i.test(seg)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(seg)) return true;
  return false;
}

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .trim();
}

function getUrlObject(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function canonicalQuery(urlObj) {
  const pairs = [];
  for (const [key, value] of urlObj.searchParams.entries()) {
    if (TRACKING_PARAM_RE.test(key)) continue;
    pairs.push([key, value]);
  }
  pairs.sort((a, b) => {
    const k = a[0].localeCompare(b[0]);
    if (k !== 0) return k;
    return a[1].localeCompare(b[1]);
  });
  if (!pairs.length) return '';
  return `?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
}

function canonicalPath(pathname) {
  const cleaned = (pathname || '/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
  return cleaned || '/';
}

function pathCluster(url) {
  const u = getUrlObject(url);
  if (!u) return 'unknown';
  const segs = u.pathname.split('/').filter(Boolean).slice(0, 3).map((seg) => {
    const s = seg.toLowerCase();
    return isDynamicSegment(s) ? ':id' : s;
  });
  return segs.length ? segs.join('/') : 'root';
}

export function canonicalUrlForDuplicate(url) {
  const u = getUrlObject(url);
  if (!u) return (url || '').trim();

  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = canonicalPath(u.pathname);
  const query = canonicalQuery(u);
  return `${host}${path}${query}`;
}

export function buildDuplicateReport(tabs) {
  const exactMap = new Map();
  const similarMap = new Map();

  for (const tab of tabs) {
    delete tab._dupCount;
    delete tab._similarCount;

    const exactKey = canonicalUrlForDuplicate(tab.url);
    if (!exactMap.has(exactKey)) exactMap.set(exactKey, []);
    exactMap.get(exactKey).push(tab);
  }

  const exactGroups = [...exactMap.values()].filter((group) => group.length > 1);
  const exactIds = new Set(exactGroups.flatMap((group) => group.map((t) => t.id)));

  for (const tab of tabs) {
    if (exactIds.has(tab.id)) continue;

    const title = normalizeTitle(tab.title);
    if (!title || title.length < 8 || GENERIC_TITLE_RE.test(title)) continue;

    const domain = (tab.domain || '').toLowerCase();
    const cluster = pathCluster(tab.url);
    const key = `${domain}::${title}::${cluster}`;
    if (!similarMap.has(key)) similarMap.set(key, []);
    similarMap.get(key).push(tab);
  }

  const similarGroups = [...similarMap.values()].filter((group) => {
    if (group.length < 2) return false;
    const uniqueUrls = new Set(group.map((t) => canonicalUrlForDuplicate(t.url)));
    return uniqueUrls.size > 1;
  });

  return { exactGroups, similarGroups };
}

export function applyDuplicateBadges(tabs, exactGroups, similarGroups) {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  for (const group of exactGroups) {
    for (const tab of group) {
      const current = byId.get(tab.id);
      if (current) current._dupCount = group.length;
    }
  }
  for (const group of similarGroups) {
    for (const tab of group) {
      const current = byId.get(tab.id);
      if (current) current._similarCount = group.length;
    }
  }
}
