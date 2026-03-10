/**
 * Deep tab analyzer — domain, topic, keyword, duplicate, persona profiling.
 * Returns structured JSON consumed by the extension UI.
 */

const TOPIC_RULES = [
  ['LLM/大语言模型', ['llm','gpt','chatgpt','openai','claude','anthropic','langchain','gemini','chatglm','mixtral','智谱','大模型','语言模型']],
  ['RAG/检索增强', ['rag','retrieval','embedding','vector','chromadb','pinecone','qdrant','faiss','向量','检索','ragflow','llamaindex']],
  ['Prompt工程', ['prompt','prompting','prompt-engineering','提示词','提示工程','chain-of-thought']],
  ['AI Agent/智能体', ['agent','autogen','metagpt','openclaw','openskill','flowise','botpress','interpreter','nanobot']],
  ['图像生成', ['stable','diffusion','easyphoto','midjourney','stitch','图像生成']],
  ['语音/TTS', ['tts','voice','metavoice','speech','语音','dubbing','pyvideotrans']],
  ['OCR/文档', ['ocr','easyocr','pdf','stirling','document','文档']],
  ['嵌入式/IoT', ['stm32','firmware','固件','iot','embedded','mcu','knx','matter','connectedhomeip','homeassistant','homekit','modbus','bootloader','swd','microchip']],
  ['安全/逆向', ['reverse','exploit','vulnerability','malware','binary','pwn','ctf','hook','frida','安全','漏洞','看雪','kanxue','trufflesecurity']],
  ['前端开发', ['react','vue','nextjs','css','javascript','typescript','frontend','component','tailwind','virtual-dom','前端','monitor','web-tracing']],
  ['Go语言', ['golang','go-','kratos','pprof','go-i18n','go-sunrise']],
  ['后端/微服务', ['spring','ruoyi','mall','seata','cola','微服务','后端']],
  ['DevOps/网络', ['docker','kubernetes','nginx','deploy','zerotier','nps','ssh','iptables','vlan','shellcrash','运维','部署','内网穿透']],
  ['AI工具/效率', ['cursor','vscode','code-review','coderabbit','devops-gpt','github-actions','ai-bot','ai工具','效率']],
  ['数据分析', ['data','analyst','julius','datagpt','akkio','chart-gpt','数据分析','数据科学']],
  ['智能家居', ['knx','home-assistant','1home','gira','panasonic','智能家居','gateway']],
  ['创业/商业', ['创业','副业','wrapper','产品市场','开源项目收入','数字游民']],
  ['学习资源', ['beginner','tutorial','course','learn','deeplearning.ai','教程','入门','学习']],
];

const PLATFORM_RULES = [
  ['GitHub',      t => /github\.com/.test(t.domain)],
  ['微信公众号',   t => t.domain === 'mp.weixin.qq.com'],
  ['看雪论坛',     t => /kanxue\.com/.test(t.domain)],
  ['宝玉博客',     t => t.domain === 'baoyu.io'],
  ['B站',         t => /bilibili\.com/.test(t.domain)],
  ['掘金',         t => t.domain === 'juejin.cn'],
  ['SegmentFault', t => /segmentfault\.com/.test(t.domain)],
  ['HuggingFace',  t => /huggingface\.co/.test(t.domain)],
  ['Medium',       t => /medium\.com/.test(t.domain)],
  ['DeepWiki',     t => /deepwiki\.com/.test(t.domain)],
  ['StackOverflow', t => /stackoverflow\.com/.test(t.domain)],
  ['YouTube',      t => /youtube\.com/.test(t.domain)],
  ['CSDN',         t => /csdn\.net/.test(t.domain)],
  ['V2EX',         t => /v2ex\.com/.test(t.domain)],
  ['Linux.do',     t => /linux\.do/.test(t.domain)],
];

const STOP_WORDS = new Set([
  'the','and','for','with','from','that','this','are','was','not','you','your',
  'can','will','has','have','how','what','why','who','which','where','when',
  'all','but','use','using','one','get','more','new','its','about','into','just',
  'github','com','www','http','https','main','master','blob','tree','readme',
  'html','page','home','login','docs','blog','article','post','search','latest',
  'best','guide','based','build','open','source','code','app','tool','data',
  'learn','not','found',
]);

export function analyzeTabs(tabs) {
  if (!tabs.length) return { error: 'no tabs' };

  const total = tabs.length;

  // ── Domains ──
  const domainCount = {};
  const domainTabs = {};
  for (const t of tabs) {
    const d = t.domain || extractDomain(t.url) || 'unknown';
    domainCount[d] = (domainCount[d] || 0) + 1;
    (domainTabs[d] ??= []).push(t);
  }
  const topDomains = Object.entries(domainCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([domain, count]) => ({
      domain, count,
      pct: +(count / total * 100).toFixed(1),
      sample: (domainTabs[domain][0]?.title || '').slice(0, 50),
    }));

  // ── Duplicates ──
  const urlMap = {};
  for (const t of tabs) {
    const norm = normalizeUrl(t.url);
    (urlMap[norm] ??= []).push({ id: t.id, title: (t.title || '').slice(0, 60), url: t.url });
  }
  const duplicates = Object.entries(urlMap)
    .filter(([, v]) => v.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([url, items]) => ({ url: url.slice(0, 80), count: items.length, tabs: items }));
  const dupRemovable = duplicates.reduce((s, d) => s + d.count - 1, 0);

  // ── Topics ──
  const topicMap = {};
  let unclustered = 0;
  for (const t of tabs) {
    const text = `${(t.title || '').toLowerCase()} ${(t.url || '').toLowerCase()} ${(t.domain || '').toLowerCase()}`;
    let matched = false;
    for (const [topic, keywords] of TOPIC_RULES) {
      if (keywords.some(kw => text.includes(kw))) {
        (topicMap[topic] ??= []).push({ id: t.id, title: (t.title || '').slice(0, 60), url: t.url });
        matched = true;
        break;
      }
    }
    if (!matched) unclustered++;
  }
  const topics = Object.entries(topicMap)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, items]) => ({ name, count: items.length, pct: +(items.length / total * 100).toFixed(1), tabs: items.slice(0, 5) }));

  // ── Platforms ──
  const platforms = PLATFORM_RULES.map(([name, fn]) => {
    const count = tabs.filter(fn).length;
    return { name, count, pct: +(count / total * 100).toFixed(1) };
  }).filter(p => p.count > 0).sort((a, b) => b.count - a.count);

  // ── Keywords ──
  const enKw = {};
  const cnKw = {};
  for (const t of tabs) {
    const title = (t.title || '').toLowerCase();
    for (const w of title.match(/[a-z]{3,}/g) || []) {
      if (!STOP_WORDS.has(w)) enKw[w] = (enKw[w] || 0) + 1;
    }
    for (const w of (t.title || '').match(/[\u4e00-\u9fff]{2,6}/g) || []) {
      cnKw[w] = (cnKw[w] || 0) + 1;
    }
  }
  const enKeywords = Object.entries(enKw).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, count]) => ({ word, count }));
  const cnKeywords = Object.entries(cnKw).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, count]) => ({ word, count }));

  // ── Language distribution ──
  let cnCount = 0, enCount = 0, mixedCount = 0;
  for (const t of tabs) {
    const title = t.title || '';
    const hasCn = /[\u4e00-\u9fff]/.test(title);
    const hasEn = /[a-zA-Z]{3,}/.test(title);
    if (hasCn && hasEn) mixedCount++;
    else if (hasCn) cnCount++;
    else enCount++;
  }

  // ── Problem tabs ──
  const deadPages = tabs.filter(t => /not found|404|页面找不到|redirecting/i.test(t.title || ''))
    .map(t => ({ id: t.id, title: (t.title || '').slice(0, 60), url: t.url }));
  const loginPages = tabs.filter(t => /login|auth|signin|sign-in/i.test(t.url || ''))
    .map(t => ({ id: t.id, title: (t.title || '').slice(0, 60), url: t.url, domain: t.domain }));
  const localPages = tabs.filter(t => /localhost|127\.0\.0\.1|192\.168\.|\.local[/:]/.test(t.url || ''))
    .map(t => ({ id: t.id, title: (t.title || '').slice(0, 60), url: t.url }));

  // ── Persona ──
  const persona = buildPersona({ total, topics, platforms, topDomains, cnCount, enCount, mixedCount, dupRemovable, deadPages, loginPages, localPages });

  return {
    overview: {
      total,
      uniqueDomains: Object.keys(domainCount).length,
      dupGroups: duplicates.length,
      dupRemovable,
      deadPages: deadPages.length,
      loginPages: loginPages.length,
      localPages: localPages.length,
      cnTabs: cnCount,
      enTabs: enCount,
      mixedTabs: mixedCount,
    },
    topDomains,
    topics,
    unclustered,
    platforms,
    keywords: { en: enKeywords, cn: cnKeywords },
    duplicates: duplicates.slice(0, 15),
    problemTabs: { deadPages, loginPages, localPages },
    persona,
  };
}

function buildPersona({ total, topics, platforms, topDomains, cnCount, enCount, mixedCount, dupRemovable, deadPages, loginPages, localPages }) {
  const ghPlatform = platforms.find(p => p.name === 'GitHub');
  const ghPct = ghPlatform ? ghPlatform.pct : 0;

  const topicNames = topics.map(t => t.name);
  const aiTopics = topics.filter(t => ['LLM/大语言模型','RAG/检索增强','Prompt工程','AI Agent/智能体'].includes(t.name));
  const aiTotal = aiTopics.reduce((s, t) => s + t.count, 0);
  const iotTopics = topics.filter(t => ['嵌入式/IoT','智能家居','安全/逆向'].includes(t.name));
  const iotTotal = iotTopics.reduce((s, t) => s + t.count, 0);

  const identity = [];
  if (aiTotal > 30) identity.push('AI/LLM 深度研究者');
  if (iotTotal > 20) identity.push('嵌入式/IoT 专业开发者');
  if (ghPct > 20) identity.push('重度 GitHub 用户');
  if (topics.some(t => t.name === '前端开发' && t.count > 10)) identity.push('前端工程师');
  if (topics.some(t => t.name === 'Go语言' && t.count > 5)) identity.push('Go 开发者');
  if (identity.length === 0) identity.push('技术爱好者');

  const techInterests = topics.slice(0, 8).map(t => ({
    name: t.name, count: t.count,
    intensity: t.count > 15 ? 'hot' : (t.count > 8 ? 'warm' : 'cool'),
  }));

  const learningStyle = [];
  if (ghPct > 20) learningStyle.push('源码驱动 — 习惯深入代码层面理解技术');
  if (cnCount + mixedCount > enCount * 0.5) learningStyle.push('中英双语 — 同时追踪中英文技术社区');
  const maxTopicCount = topics.length > 0 ? topics[0].count : 0;
  if (maxTopicCount > 20) learningStyle.push('广度优先 — 同主题会大量打开文章广泛扫描');
  if (total > 200) learningStyle.push('信息囤积 — 习惯"以后再看"，标签即 TODO');

  const traits = [];
  traits.push({ trait: '好奇心强', evidence: `${total} 个标签，${topDomains.length}+ 域名，涵盖 ${topics.length} 个方向` });
  if (total > 150) traits.push({ trait: '拖延倾向', evidence: '大量标签长期积累未阅读' });
  if (maxTopicCount > 15) traits.push({ trait: '完美主义', evidence: `单主题最多 ${maxTopicCount} 篇，广泛对比` });
  if (ghPct > 20) traits.push({ trait: '实用主义', evidence: 'GitHub 仓库 > 博客文章' });
  if (loginPages.length > 3 || deadPages.length > 3) traits.push({ trait: '信息焦虑', evidence: '登录页、死链都舍不得关' });
  if (topics.length > 10) traits.push({ trait: '跨界思维', evidence: `技术栈跨度 ${topics.length} 个方向` });

  const cleanup = {
    immediate: dupRemovable + deadPages.length + loginPages.length,
    moderate: localPages.length,
    total,
    estimatedAfter: Math.max(40, total - dupRemovable - deadPages.length - loginPages.length - localPages.length),
  };

  return { identity, techInterests, aiTotal, iotTotal, learningStyle, traits, cleanup };
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url || '';
  }
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
