import { getAIProvider } from './ai-provider.js';
import { queries, forceSave } from '../db.js';
import { logApiCall } from './api-logger.js';

function canonicalUrlForDuplicate(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = (u.pathname || '/').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    const trackingRe = /^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$|ref$|ref_src$|spm$)/i;
    const pairs = [];
    for (const [key, value] of u.searchParams.entries()) {
      if (!trackingRe.test(key)) pairs.push([key, value]);
    }
    pairs.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const query = pairs.length ? `?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : '';
    return `${host}${path}${query}`;
  } catch {
    return (url || '').trim();
  }
}

const CATEGORY_DEFINITIONS = {
  tech: { name: '技术/编程', icon: '💻', color: '#007AFF' },
  research: { name: '研究/学术', icon: '🔬', color: '#5856D6' },
  news: { name: '新闻/资讯', icon: '📰', color: '#FF9500' },
  design: { name: '设计/创意', icon: '🎨', color: '#FF2D55' },
  business: { name: '商业/金融', icon: '💼', color: '#34C759' },
  entertainment: { name: '娱乐/视频', icon: '🎬', color: '#FF3B30' },
  social: { name: '社交/论坛', icon: '💬', color: '#5AC8FA' },
  shopping: { name: '购物/电商', icon: '🛒', color: '#AF52DE' },
  reference: { name: '参考/文档', icon: '📚', color: '#30B0C7' },
  tools: { name: '工具/服务', icon: '🔧', color: '#8E8E93' },
  other: { name: '其他', icon: '📌', color: '#9CA3AF' },
};

const DOMAIN_RULES = [
  { pattern: /github\.com|gitlab|bitbucket|stackoverflow|stackexchange|npmjs|pypi|crates\.io|pkg\.go\.dev/i, category: 'tech' },
  { pattern: /docs\.|documentation|readme|wiki\.|developer\.|devdocs/i, category: 'reference' },
  { pattern: /arxiv|scholar\.google|researchgate|ieee|acm\.org|nature\.com|sciencedirect/i, category: 'research' },
  { pattern: /youtube|twitch|netflix|spotify|bilibili|v\.qq|iqiyi/i, category: 'entertainment' },
  { pattern: /twitter|x\.com|facebook|instagram|reddit|weibo|zhihu|v2ex|discourse|mastodon/i, category: 'social' },
  { pattern: /amazon|taobao|jd\.com|ebay|shopify|aliexpress|pinduoduo/i, category: 'shopping' },
  { pattern: /figma|dribbble|behance|canva|sketch|framer/i, category: 'design' },
  { pattern: /bloomberg|reuters|wsj|ft\.com|cnbc|investing/i, category: 'business' },
  { pattern: /bbc|cnn|nytimes|theguardian|36kr|ifanr|sspai/i, category: 'news' },
  { pattern: /notion|trello|slack|asana|linear|vercel|netlify|supabase|railway/i, category: 'tools' },
  { pattern: /wechat|weixin|mp\.weixin/i, category: 'social' },
  { pattern: /juejin|segmentfault|csdn|cnblogs|jianshu/i, category: 'tech' },
  { pattern: /medium\.com|dev\.to|hashnode/i, category: 'tech' },
  { pattern: /huggingface|openai\.com|anthropic|ollama/i, category: 'tech' },
  { pattern: /kanxue\.com|freebuf|seebug/i, category: 'tech' },
];

const TITLE_KEYWORDS = {
  tech: /(api|sdk|framework|库|框架|开发|编程|代码|部署|docker|kubernetes|k8s|git|ci\/cd|devops|前端|后端|全栈|react|vue|angular|node|python|golang|rust|java|typescript|javascript|swift|kotlin|flutter|llm|gpt|模型|ai|机器学习|深度学习|neural|transformer|embedding|rag|prompt|agent|mcp)/i,
  reference: /(文档|documentation|docs|tutorial|教程|指南|guide|手册|manual|reference|api\s*reference|入门|getting\s*started|quickstart)/i,
  research: /(论文|paper|研究|survey|arxiv|study|analysis|实验|experiment)/i,
  news: /(发布|release|announce|更新|update|版本|version|新闻|news|报道)/i,
  design: /(设计|design|ui|ux|figma|原型|prototype|色彩|typography|布局|layout)/i,
  business: /(融资|投资|商业|创业|startup|saas|revenue|估值|valuation|ipo)/i,
};

const AI_PROMPT = `你是一个网页标签分类专家。你的任务是将浏览器标签页归类到合适的类别中。

可用类别：
- tech: 技术/编程
- research: 研究/学术
- news: 新闻/资讯
- design: 设计/创意
- business: 商业/金融
- entertainment: 娱乐/视频
- social: 社交/论坛
- shopping: 购物/电商
- reference: 参考/文档
- tools: 工具/服务
- other: 其他

分类规则：
1. 综合URL域名、页面标题和内容摘要判断
2. 对于已有初步分类且置信度较高的标签，只做微调
3. 技术文档应归类为 reference 而非 tech
4. 技术新闻应归类为 tech 而非 news

请严格返回 JSON：
{
  "classifications": [
    {
      "id": "标签ID",
      "category": "类别ID",
      "confidence": 0.0-1.0,
      "reason": "简短理由",
      "recommendation": "keep|close|bookmark|snooze",
      "freshness": 0.0-1.0
    }
  ]
}

recommendation 说明：
- keep: 当前有价值，值得保留
- close: 过时、重复或低价值，可关闭
- bookmark: 高参考价值，建议永久收藏
- snooze: 当前不急，稍后再看

freshness 说明：0=过时 1=最新，根据标题/URL/内容判断时效性`;

export async function categorizeTabs(tabs, { onProgress, model } = {}) {
  const results = {};
  const facetUpdates = {};

  // === Phase 1: Domain grouping (instant, local) ===
  if (onProgress) onProgress({
    stage: 1, stageName: '域名聚合', stageDesc: '按域名快速分组',
    processed: 0, total: tabs.length, pct: 0,
  });

  const domainGroups = {};
  for (const tab of tabs) {
    const domain = tab.domain || 'unknown';
    if (!domainGroups[domain]) domainGroups[domain] = [];
    domainGroups[domain].push(tab);
  }
  const topDomains = Object.entries(domainGroups)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([domain, list]) => `${domain}(${list.length})`);

  if (onProgress) onProgress({
    stage: 1,
    stageName: '域名聚合',
    stageDesc: `发现 ${Object.keys(domainGroups).length} 个域名，重点来源：${topDomains.join('、') || '无'}`,
    processed: tabs.length, total: tabs.length, pct: 100,
    detail: { domains: Object.keys(domainGroups).length, topDomains },
  });

  // === Phase 2: Rule-based classification (instant, local) ===
  if (onProgress) onProgress({
    stage: 2, stageName: '规则识别', stageDesc: '匹配已知平台和域名模式',
    processed: 0, total: tabs.length, pct: 0,
  });

  let ruleMatched = 0;
  const ruleByCategory = {};
  for (const tab of tabs) {
    const fullUrl = tab.url || tab.domain || '';
    for (const { pattern, category } of DOMAIN_RULES) {
      if (pattern.test(fullUrl)) {
        results[tab.id] = { category, confidence: 0.75, source: 'rule' };
        ruleMatched++;
        ruleByCategory[category] = (ruleByCategory[category] || 0) + 1;
        break;
      }
    }
  }
  const topRuleCategory = Object.entries(ruleByCategory).sort((a, b) => b[1] - a[1])[0];

  if (onProgress) onProgress({
    stage: 2,
    stageName: '规则识别',
    stageDesc: `${ruleMatched}/${tabs.length} 命中已知规则，主分布 ${topRuleCategory ? `${topRuleCategory[0]}(${topRuleCategory[1]})` : '无'}`,
    processed: tabs.length, total: tabs.length, pct: 100,
    detail: { matched: ruleMatched, total: tabs.length, byCategory: ruleByCategory },
  });

  // === Phase 3: Title keyword analysis (instant, local) ===
  if (onProgress) onProgress({
    stage: 3, stageName: '标题分析', stageDesc: '通过标题关键词判断类别',
    processed: 0, total: tabs.length, pct: 0,
  });

  let titleMatched = 0;
  const titleByCategory = {};
  for (const tab of tabs) {
    if (results[tab.id]?.confidence >= 0.75) continue;
    const title = (tab.title || '').toLowerCase();
    for (const [category, pattern] of Object.entries(TITLE_KEYWORDS)) {
      if (pattern.test(title)) {
        const existing = results[tab.id];
        if (!existing || existing.confidence < 0.6) {
          results[tab.id] = { category, confidence: 0.6, source: 'title' };
          titleMatched++;
          titleByCategory[category] = (titleByCategory[category] || 0) + 1;
        }
        break;
      }
    }
  }

  if (onProgress) onProgress({
    stage: 3,
    stageName: '标题分析',
    stageDesc: `标题语义补全 ${titleMatched} 个标签，累计已分类 ${Object.keys(results).length}`,
    processed: tabs.length, total: tabs.length, pct: 100,
    detail: { newMatches: titleMatched, totalClassified: Object.keys(results).length, byCategory: titleByCategory },
  });

  // === Phase 4: AI deep analysis (requires network) ===
  const unclassified = tabs.filter(t => !results[t.id] || results[t.id].confidence < 0.6);
  const lowConfidence = tabs.filter(t => results[t.id] && results[t.id].confidence >= 0.6 && results[t.id].confidence < 0.75);
  const needsAI = [...unclassified, ...lowConfidence];

  if (needsAI.length > 0) {
    const ai = getAIProvider(model);
    const batchSize = 30;
    const totalBatches = Math.ceil(needsAI.length / batchSize);

    if (onProgress) onProgress({
      stage: 4, stageName: 'AI 深度分析', stageDesc: `${needsAI.length} 个标签需要AI判断`,
      processed: 0, total: needsAI.length, pct: 0,
    });

    for (let i = 0; i < needsAI.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = needsAI.slice(i, i + batchSize);

      if (onProgress) onProgress({
        stage: 4, stageName: 'AI 深度分析',
        stageDesc: `批次 ${batchNum}/${totalBatches}：阅读标题 + URL + 内容摘要，做上下文判断`,
        processed: i, total: needsAI.length,
        pct: Math.round((i / needsAI.length) * 100),
        batch: batchNum, totalBatches,
      });

      const tabList = batch.map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        domain: t.domain,
        currentCategory: results[t.id]?.category || null,
        ...(t.content ? { excerpt: t.content.substring(0, 200) } : {}),
      }));

      const userMessage = `请将以下 ${batch.length} 个标签归类：

${JSON.stringify(tabList, null, 2)}

返回 JSON: { "classifications": [{ "id": "ID", "category": "类别", "confidence": 0.0-1.0, "reason": "理由" }] }`;

      try {
        const response = await ai.chat(AI_PROMPT, userMessage, { json: true });
        const parsed = JSON.parse(response);

        if (parsed.classifications) {
          for (const item of parsed.classifications) {
            const existing = results[item.id];
            if (!existing || item.confidence > existing.confidence) {
              results[item.id] = {
                category: item.category,
                confidence: item.confidence || 0.85,
                reason: item.reason,
                source: 'ai',
                recommendation: item.recommendation || null,
                freshness: item.freshness ?? null,
              };
            }
          }
        }
      } catch (err) {
        console.error(`[Categorizer] AI batch ${batchNum} failed:`, err.message);
        logApiCall({ provider: 'categorizer', model: model || 'default', durationMs: 0, success: false, error: err.message });
        for (const tab of batch) {
          if (!results[tab.id]) {
            results[tab.id] = { category: 'other', confidence: 0.3, source: 'fallback' };
          }
        }
      }
    }

    if (onProgress) onProgress({
      stage: 4, stageName: 'AI 深度分析', stageDesc: `AI 分析完成`,
      processed: needsAI.length, total: needsAI.length, pct: 100,
    });
  } else {
    if (onProgress) onProgress({
      stage: 4, stageName: 'AI 深度分析', stageDesc: '所有标签已通过规则和标题分类，跳过AI',
      processed: 0, total: 0, pct: 100,
    });
  }

  // === Phase 5: Cross-validation, facet computation, and consolidation ===
  if (onProgress) onProgress({
    stage: 5, stageName: '整合修正', stageDesc: '交叉验证、标记 Facet 并合并分类结果',
    processed: 0, total: tabs.length, pct: 0,
  });

  for (const tab of tabs) {
    if (!results[tab.id]) {
      results[tab.id] = { category: 'other', confidence: 0.3, source: 'default' };
    }
  }

  const staleDaysThreshold = 30;
  const dupMap = new Map();
  for (const tab of tabs) {
    const key = canonicalUrlForDuplicate(tab.url);
    if (!dupMap.has(key)) dupMap.set(key, []);
    dupMap.get(key).push(tab);
  }

  let clusterIndex = 0;
  const dupClusters = {};
  for (const [canonical, group] of dupMap.entries()) {
    if (group.length < 2) continue;
    const clusterId = `dc_${Date.now()}_${clusterIndex++}`;
    dupClusters[clusterId] = { canonicalUrl: canonical, tabIds: group.map(t => t.id) };
    for (const tab of group) {
      if (!facetUpdates[tab.id]) facetUpdates[tab.id] = { facets: [], clusterId: null };
      facetUpdates[tab.id].facets.push('duplicate');
      facetUpdates[tab.id].clusterId = clusterId;
    }
  }

  for (const tab of tabs) {
    if (!facetUpdates[tab.id]) facetUpdates[tab.id] = { facets: [], clusterId: null };
    const staleDays = tab.first_seen_at
      ? Math.floor((Date.now() - new Date(tab.first_seen_at).getTime()) / 86400000)
      : 0;
    if (staleDays > staleDaysThreshold) facetUpdates[tab.id].facets.push('outdated');
    if (tab.discarded || tab.is_frozen) facetUpdates[tab.id].facets.push('frozen');

    const r = results[tab.id];
    if (r) {
      facetUpdates[tab.id].recommendation = r.recommendation || null;
      facetUpdates[tab.id].freshness = r.freshness ?? null;
    }
  }

  const catCounts = {};
  for (const { category } of Object.values(results)) {
    catCounts[category] = (catCounts[category] || 0) + 1;
  }
  const profileHint = inferProfileHint(catCounts, tabs.length);

  const stats = {
    total: tabs.length,
    bySource: {},
    byCategory: catCounts,
    avgConfidence: 0,
    profileHint,
    dupClusters: Object.keys(dupClusters).length,
    facetSummary: {},
  };
  let confSum = 0;
  for (const r of Object.values(results)) {
    stats.bySource[r.source] = (stats.bySource[r.source] || 0) + 1;
    confSum += r.confidence;
  }
  stats.avgConfidence = Math.round((confSum / tabs.length) * 100);

  for (const { facets } of Object.values(facetUpdates)) {
    for (const f of facets) stats.facetSummary[f] = (stats.facetSummary[f] || 0) + 1;
  }

  if (onProgress) onProgress({
    stage: 5,
    stageName: '整合修正',
    stageDesc: `分类完成 · 平均置信度 ${stats.avgConfidence}% · 画像倾向 ${profileHint}`,
    processed: tabs.length, total: tabs.length, pct: 100,
    detail: stats,
  });

  return { classifications: results, facetUpdates, dupClusters, stats };
}

export function applyCategorizations(result) {
  const classifications = result.classifications || result;
  const facetUpdates = result.facetUpdates || {};
  const dupClusters = result.dupClusters || {};

  for (const [tabId, data] of Object.entries(classifications)) {
    const cat = typeof data === 'string' ? data : data.category;
    const confidence = data.confidence ?? null;
    const source = data.source || null;
    queries.updateTabTopic(tabId, { topicId: cat, confidence, source });
  }

  queries.clearDuplicateClusters();
  for (const [clusterId, cluster] of Object.entries(dupClusters)) {
    queries.upsertDuplicateCluster(clusterId, cluster);
  }

  let needSave = false;
  for (const [tabId, update] of Object.entries(facetUpdates)) {
    queries.setTabFacets(tabId, update.facets);
    const tab = queries.getTab.get(tabId);
    if (!tab) continue;
    if (update.clusterId) { tab.duplicate_cluster_id = update.clusterId; needSave = true; }
    if (update.recommendation) { tab.ai_recommendation = update.recommendation; needSave = true; }
    if (update.freshness != null) { tab.freshness_score = update.freshness; needSave = true; }
  }
  if (needSave) forceSave();
}

export function getCategoryDefinitions() {
  return CATEGORY_DEFINITIONS;
}

function inferProfileHint(catCounts, total) {
  if (!total) return '未知';
  const pct = (id) => (catCounts[id] || 0) / total;

  if (pct('tech') > 0.4 && pct('research') > 0.15) return '技术研究型';
  if (pct('tech') > 0.45) return '工程实践型';
  if (pct('design') > 0.25) return '创意设计型';
  if (pct('business') > 0.25) return '商业决策型';
  if (pct('news') + pct('social') > 0.45) return '资讯追踪型';
  if (pct('reference') > 0.3) return '资料归档型';
  return '综合探索型';
}
