import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel, type AIConfig } from './ai-client';
import i18next from 'i18next';
const tt = i18next.t.bind(i18next);

export interface CategoryDef {
  name: string;
  icon: string;
  color: string;
}

export const CATEGORY_DEFINITIONS: Record<string, CategoryDef> = {
  'ai-ml': { name: 'AI/机器学习', icon: '🤖', color: '#8B5CF6' },
  'programming': { name: '编程开发', icon: '💻', color: '#007AFF' },
  'devops': { name: '运维/DevOps', icon: '🚀', color: '#06B6D4' },
  'security': { name: '安全/逆向', icon: '🔒', color: '#DC2626' },
  'networking': { name: '网络/协议', icon: '🌐', color: '#0EA5E9' },
  'research': { name: '研究/学术', icon: '🔬', color: '#5856D6' },
  'news': { name: '新闻/资讯', icon: '📰', color: '#FF9500' },
  'design': { name: '设计/创意', icon: '🎨', color: '#FF2D55' },
  'business': { name: '商业/金融', icon: '💼', color: '#34C759' },
  'entertainment': { name: '娱乐/视频', icon: '🎬', color: '#FF3B30' },
  'social': { name: '社交/论坛', icon: '💬', color: '#5AC8FA' },
  'shopping': { name: '购物/电商', icon: '🛒', color: '#AF52DE' },
  'reference': { name: '参考/文档', icon: '📚', color: '#30B0C7' },
  'tools': { name: '工具/服务', icon: '🔧', color: '#8E8E93' },
  'other': { name: '其他', icon: '📌', color: '#9CA3AF' },
};

const DOMAIN_RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /huggingface|openai\.com|anthropic\.com|ollama|replicate\.com|together\.ai|deepseek|groq\.com|mistral\.ai|cohere\.com|wandb\.ai|mlflow/i, category: 'ai-ml' },
  { pattern: /kanxue\.com|freebuf|seebug|exploit-db|cve\.|hackerone|bugcrowd|virustotal|shodan|crackstation|ghidra|radare/i, category: 'security' },
  { pattern: /docker\.com|kubernetes\.io|k8s|terraform|ansible|jenkins|grafana|prometheus|datadog|cloudflare|aws\.amazon|cloud\.google|azure\.microsoft|vercel\.com|netlify|railway|render\.com|fly\.io/i, category: 'devops' },
  { pattern: /openwrt|mikrotik|pfsense|ubiquiti|unifi|opnsense|softether|wireguard|tailscale|zerotier/i, category: 'networking' },
  { pattern: /docs\.|documentation|readme|wiki\.|developer\.|devdocs|man7\.org|manpages/i, category: 'reference' },
  { pattern: /github\.com|gitlab|bitbucket|stackoverflow|stackexchange|npmjs|pypi|crates\.io|pkg\.go\.dev|rubygems|packagist/i, category: 'programming' },
  { pattern: /arxiv|scholar\.google|researchgate|ieee|acm\.org|nature\.com|sciencedirect|ssrn|pubmed/i, category: 'research' },
  { pattern: /youtube|twitch|netflix|spotify|bilibili|v\.qq|iqiyi|disneyplus|hbo|primevideo/i, category: 'entertainment' },
  { pattern: /twitter|x\.com|facebook|instagram|reddit|weibo|zhihu|v2ex|discourse|mastodon|threads\.net|wechat|weixin|mp\.weixin/i, category: 'social' },
  { pattern: /amazon|taobao|jd\.com|ebay|shopify|aliexpress|pinduoduo|walmart/i, category: 'shopping' },
  { pattern: /figma|dribbble|behance|canva|sketch|framer|adobe\.com\/products/i, category: 'design' },
  { pattern: /bloomberg|reuters|wsj|ft\.com|cnbc|investing|crunchbase|pitchbook/i, category: 'business' },
  { pattern: /bbc|cnn|nytimes|theguardian|36kr|ifanr|sspai|techcrunch|theverge|arstechnica/i, category: 'news' },
  { pattern: /notion|trello|slack|asana|linear|supabase|postman|insomnia/i, category: 'tools' },
  { pattern: /juejin|segmentfault|csdn|cnblogs|jianshu|medium\.com|dev\.to|hashnode/i, category: 'programming' },
];

const TITLE_KEYWORDS: Record<string, RegExp> = {
  'ai-ml': /(llm|gpt|claude|gemini|模型|ai\b|机器学习|深度学习|neural|transformer|embedding|rag|prompt|agent|mcp|diffusion|stable\s*diffusion|midjourney|copilot|fine-?tun|lora|gguf|ggml|ollama|langchain|langsmith|chatgpt|openai|anthropic|token|向量|vector\s*db|训练|inference|推理)/i,
  'security': /(逆向|reverse|crack|漏洞|exploit|cve|渗透|pentest|xss|sql\s*inject|pwn|ctf|malware|病毒|加密|decrypt|hook|frida|ida\s*pro|ghidra|二进制|binary\s*analy|shellcode|安全|security|防火墙|firewall)/i,
  'devops': /(docker|kubernetes|k8s|ci\/cd|devops|部署|deploy|terraform|ansible|jenkins|grafana|prometheus|nginx|运维|监控|容器|container|helm|argocd|github\s*action)/i,
  'networking': /(路由|router|交换机|switch|vlan|subnet|dns|dhcp|tcp|udp|iptables|网络|network|openwrt|软路由|旁路由|mesh|wifi|wireguard|vpn|proxy|代理|clash|v2ray|trojan|tailscale)/i,
  'programming': /(api|sdk|framework|库|框架|开发|编程|代码|前端|后端|全栈|react|vue|angular|node|python|golang|rust|java|typescript|javascript|swift|kotlin|flutter|c\+\+|编译|compiler|算法|algorithm|数据结构|设计模式|重构|refactor)/i,
  'reference': /(文档|documentation|docs|tutorial|教程|指南|guide|手册|manual|reference|api\s*reference|入门|getting\s*started|quickstart|cheatsheet)/i,
  'research': /(论文|paper|研究|survey|arxiv|study|analysis|实验|experiment|学术)/i,
  'news': /(发布|release|announce|更新|update|版本|version|新闻|news|报道|刚刚)/i,
  'design': /(设计|design|ui|ux|figma|原型|prototype|色彩|typography|布局|layout|motion|动效)/i,
  'business': /(融资|投资|商业|创业|startup|saas|revenue|估值|valuation|ipo|市场|market)/i,
};

const AI_CLASSIFY_SYSTEM = `You are an intelligent web page tab classification expert. Your goal is to accurately categorize browser tabs into the most appropriate sub-categories.

Available categories (use these IDs strictly):
- ai-ml: AI/Machine Learning
- programming: Programming/Development
- devops: DevOps/Infrastructure
- security: Security/Reverse Engineering
- networking: Networking/Protocols
- research: Research/Academic
- news: News/Media
- design: Design/Creative
- business: Business/Finance
- entertainment: Entertainment/Video
- social: Social/Forums
- shopping: Shopping/E-commerce
- reference: Reference/Documentation
- tools: Tools/Services
- other: Other

Key classification principles:
1. Look at content substance, not source platform. An AI project on GitHub → ai-ml, router firmware on GitHub → networking
2. Classify tech blogs/forums by the specific topic, don't broadly assign to programming
3. Carefully distinguish AI content: prompt engineering → ai-ml, using AI to write code tutorial → programming
4. Generate meaningful specific tags, e.g. ["C++", "Compiler", "LLVM"] not generic ["tech", "code"]
5. Output results in JSON`;

const classifyResultSchema = z.object({
  classifications: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      confidence: z.number(),
      reason: z.string(),
      tags: z.array(z.string()),
    }),
  ),
});

export interface TabInput {
  id: string;
  url: string;
  title: string;
  domain: string;
  content_text?: string | null;
}

export interface ClassifyResult {
  category: string;
  confidence: number;
  source: string;
  reason?: string;
  tags?: string[];
}

export interface ProgressEvent {
  stage: number;
  stageName: string;
  stageDesc: string;
  processed: number;
  total: number;
  pct: number;
}

export async function categorizeTabs(
  tabs: TabInput[],
  config: AIConfig,
  opts: { onProgress?: (p: ProgressEvent) => void; abortSignal?: AbortSignal } = {},
): Promise<{ classifications: Record<string, ClassifyResult>; stats: any }> {
  const { onProgress, abortSignal } = opts;
  const results: Record<string, ClassifyResult> = {};

  // Phase 1: Domain grouping
  onProgress?.({ stage: 1, stageName: tt('classify.domainGroup'), stageDesc: tt('classify.domainGroupDesc'), processed: 0, total: tabs.length, pct: 0 });

  const domainGroups: Record<string, TabInput[]> = {};
  for (const tab of tabs) {
    const d = tab.domain || 'unknown';
    if (!domainGroups[d]) domainGroups[d] = [];
    domainGroups[d].push(tab);
  }

  const topDomains = Object.entries(domainGroups)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([d, list]) => `${d}(${list.length})`);

  onProgress?.({
    stage: 1, stageName: tt('classify.domainGroup'),
    stageDesc: tt('classify.domainFound', { count: Object.keys(domainGroups).length, top: topDomains.join(', ') || '-' }),
    processed: tabs.length, total: tabs.length, pct: 100,
  });

  // Phase 2: Rule-based
  onProgress?.({ stage: 2, stageName: tt('classify.ruleMatch'), stageDesc: tt('classify.ruleMatchDesc'), processed: 0, total: tabs.length, pct: 0 });

  const CONTENT_PLATFORMS = /juejin|segmentfault|csdn|cnblogs|jianshu|medium\.com|dev\.to|hashnode|zhihu|v2ex|reddit/i;
  let ruleMatched = 0;

  for (const tab of tabs) {
    const fullUrl = tab.url || tab.domain || '';
    for (const { pattern, category } of DOMAIN_RULES) {
      if (pattern.test(fullUrl)) {
        const isContentPlatform = CONTENT_PLATFORMS.test(fullUrl);
        results[tab.id] = {
          category,
          confidence: isContentPlatform ? 0.5 : 0.75,
          source: 'rule',
          tags: generateBasicTags(tab, category),
        };
        ruleMatched++;
        break;
      }
    }
  }

  onProgress?.({
    stage: 2, stageName: tt('classify.ruleMatch'),
    stageDesc: tt('classify.ruleHit', { matched: ruleMatched, total: tabs.length }),
    processed: tabs.length, total: tabs.length, pct: 100,
  });

  // Phase 3: Title keywords
  onProgress?.({ stage: 3, stageName: tt('classify.titleAnalysis'), stageDesc: tt('classify.titleAnalysisDesc'), processed: 0, total: tabs.length, pct: 0 });

  let titleMatched = 0;
  for (const tab of tabs) {
    if (results[tab.id]?.confidence >= 0.75) continue;
    const title = (tab.title || '').toLowerCase();
    for (const [category, pattern] of Object.entries(TITLE_KEYWORDS)) {
      if (pattern.test(title)) {
        const existing = results[tab.id];
        if (!existing || existing.confidence <= 0.6 || existing.category !== category) {
          results[tab.id] = {
            category, confidence: 0.65, source: 'title',
            tags: generateBasicTags(tab, category),
          };
          titleMatched++;
        }
        break;
      }
    }
  }

  onProgress?.({
    stage: 3, stageName: tt('classify.titleAnalysis'),
    stageDesc: tt('classify.titleDone', { matched: titleMatched, total: Object.keys(results).length }),
    processed: tabs.length, total: tabs.length, pct: 100,
  });

  // Phase 4: AI deep analysis
  const needsAI = tabs.filter(t => !results[t.id] || results[t.id].confidence < 0.6);

  if (needsAI.length > 0) {
    const batchSize = 30;
    const totalBatches = Math.ceil(needsAI.length / batchSize);

    onProgress?.({ stage: 4, stageName: tt('classify.aiDeep'), stageDesc: tt('classify.aiDeepDesc', { count: needsAI.length }), processed: 0, total: needsAI.length, pct: 0 });

    const model = getModel(config);

    for (let i = 0; i < needsAI.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = needsAI.slice(i, i + batchSize);

      onProgress?.({
        stage: 4, stageName: tt('classify.aiDeep'),
        stageDesc: tt('classify.aiBatch', { batch: batchNum, total: totalBatches }),
        processed: i, total: needsAI.length, pct: Math.round((i / needsAI.length) * 100),
      });

      const tabList = batch.map(t => ({
        id: t.id, url: t.url, title: t.title, domain: t.domain,
        currentCategory: results[t.id]?.category || null,
        ...(t.content_text ? { excerpt: t.content_text.substring(0, 200) } : {}),
      }));

      const userMsg = `请将以下 ${batch.length} 个标签归类：\n\n${JSON.stringify(tabList, null, 2)}`;

      if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const { object: parsed } = await generateObject({
          model,
          system: AI_CLASSIFY_SYSTEM,
          prompt: userMsg,
          schema: classifyResultSchema,
          temperature: 0.3,
          abortSignal,
        });

        for (const item of parsed.classifications) {
          const validCategory = item.category in CATEGORY_DEFINITIONS ? item.category : 'other';
          const existing = results[item.id];
          if (!existing || (item.confidence || 0.85) > existing.confidence) {
            results[item.id] = {
              category: validCategory,
              confidence: item.confidence || 0.85,
              reason: item.reason,
              source: 'ai',
              tags: item.tags,
            };
          }
        }
      } catch (err) {
        console.error(`[Classify] AI batch ${batchNum} failed:`, (err as Error).message);
        for (const tab of batch) {
          if (!results[tab.id]) {
            results[tab.id] = { category: 'other', confidence: 0.3, source: 'fallback' };
          }
        }
      }
    }

    onProgress?.({ stage: 4, stageName: tt('classify.aiDeep'), stageDesc: tt('classify.aiDone'), processed: needsAI.length, total: needsAI.length, pct: 100 });
  } else {
    onProgress?.({ stage: 4, stageName: tt('classify.aiDeep'), stageDesc: tt('classify.aiSkip'), processed: 0, total: 0, pct: 100 });
  }

  // Phase 5: Consolidation
  onProgress?.({ stage: 5, stageName: tt('classify.consolidate'), stageDesc: tt('classify.consolidateDesc'), processed: 0, total: tabs.length, pct: 0 });

  for (const tab of tabs) {
    if (!results[tab.id]) {
      results[tab.id] = { category: 'other', confidence: 0.3, source: 'default' };
    }
  }

  const catCounts: Record<string, number> = {};
  let confSum = 0;
  for (const r of Object.values(results)) {
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
    confSum += r.confidence;
  }

  const profileHint = inferProfileHint(catCounts, tabs.length);

  const stats = {
    total: tabs.length,
    byCategory: catCounts,
    avgConfidence: Math.round((confSum / tabs.length) * 100),
    profileHint,
  };

  onProgress?.({
    stage: 5, stageName: tt('classify.consolidate'),
    stageDesc: tt('classify.consolidateDone', { confidence: stats.avgConfidence, profile: profileHint }),
    processed: tabs.length, total: tabs.length, pct: 100,
  });

  return { classifications: results, stats };
}

function generateBasicTags(tab: TabInput, _category: string): string[] {
  const tags: string[] = [];
  const title = (tab.title || '').toLowerCase();
  const domain = tab.domain || '';

  if (domain.includes('github.com')) tags.push('GitHub');
  else if (domain.includes('stackoverflow')) tags.push('StackOverflow');

  const termGroups: Array<{ terms: string[]; tag: string }> = [
    { terms: ['react', 'nextjs', 'next.js'], tag: 'React' },
    { terms: ['vue', 'nuxt'], tag: 'Vue' },
    { terms: ['python', 'django', 'flask', 'fastapi'], tag: 'Python' },
    { terms: ['rust', 'cargo'], tag: 'Rust' },
    { terms: ['golang', 'go '], tag: 'Go' },
    { terms: ['docker', 'container'], tag: 'Docker' },
    { terms: ['kubernetes', 'k8s'], tag: 'K8s' },
    { terms: ['llm', 'gpt', 'chatgpt', 'claude', 'gemini'], tag: 'LLM' },
    { terms: ['prompt'], tag: 'Prompt' },
    { terms: ['rag'], tag: 'RAG' },
    { terms: ['typescript', 'ts '], tag: 'TypeScript' },
    { terms: ['javascript', 'js '], tag: 'JavaScript' },
    { terms: ['c++', 'cpp'], tag: 'C++' },
    { terms: ['nginx'], tag: 'Nginx' },
    { terms: ['linux', 'debian', 'ubuntu'], tag: 'Linux' },
    { terms: ['openwrt', '软路由'], tag: 'OpenWrt' },
    { terms: ['vlan', '交换'], tag: 'VLAN' },
    { terms: ['wireguard', 'vpn'], tag: 'VPN' },
    { terms: ['逆向', 'reverse'], tag: '逆向' },
    { terms: ['frida', 'hook'], tag: 'Frida' },
  ];

  for (const { terms, tag } of termGroups) {
    if (terms.some(t => title.includes(t))) tags.push(tag);
  }

  return [...new Set(tags)].slice(0, 5);
}

function inferProfileHint(catCounts: Record<string, number>, total: number): string {
  if (!total) return tt('profile.unknown');
  const pct = (id: string) => (catCounts[id] || 0) / total;
  const techTotal = pct('programming') + pct('ai-ml') + pct('devops') + pct('security') + pct('networking');
  if (pct('ai-ml') > 0.25) return tt('profile.aiResearch');
  if (pct('security') > 0.2) return tt('profile.security');
  if (techTotal > 0.5 && pct('research') > 0.1) return tt('profile.techResearch');
  if (techTotal > 0.5) return tt('profile.engineering');
  if (pct('design') > 0.25) return tt('profile.design');
  if (pct('business') > 0.25) return tt('profile.business');
  if (pct('news') + pct('social') > 0.45) return tt('profile.news');
  if (pct('reference') > 0.3) return tt('profile.archive');
  return tt('profile.explore');
}
