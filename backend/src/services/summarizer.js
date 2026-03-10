import { getAIProvider } from './ai-provider.js';
import { queries } from '../db.js';

const SINGLE_SUMMARY_PROMPT = `你是一个内容总结专家。请为给定的网页内容生成简洁的中文摘要。

要求：
1. 摘要应在 10 句话内概括核心内容
2. 突出关键信息、结论或行动项
3. 如果是技术文章，提及核心技术点和版本
4. 如果是新闻，提及核心事件和时间
5. 使用中文回复

返回 JSON 格式：
{
  "summary": "摘要内容",
  "key_points": ["要点1", "要点2" , "..."],
  "reading_time_min": 预估阅读时间(分钟),
  "freshness": "fresh|aging|outdated",
  "freshness_reason": "判断原因"
}`;

const DETAILED_SUMMARY_PROMPT = `你是一位资深内容分析师。请对给定网页内容进行深度、全面的分析。

要求：
1. 提供详尽的内容分析（不少于300字）
2. 梳理文章的核心论点与论据结构
3. 列出所有关键技术概念/人名/术语，并简要解释
4. 分析内容的价值（对什么人有用、适合什么场景）
5. 给出行动建议（如何利用这些信息）
6. 评估信息时效性和可靠性
7. 使用中文回复

返回 JSON 格式：
{
  "summary": "详细摘要（至少300字）",
  "key_points": ["要点1", "要点2", ...],
  "concepts": [{"term": "术语", "explanation": "解释"}],
  "value_analysis": "价值分析",
  "action_items": ["行动建议1", ...],
  "reading_time_min": 预估阅读时间(分钟),
  "freshness": "fresh|aging|outdated",
  "freshness_reason": "判断原因",
  "reliability": "high|medium|low",
  "target_audience": "适合人群"
}`;

const STREAM_SUMMARY_PROMPT = `你是一个内容总结专家。请为给定的网页内容生成中文摘要。
请直接用自然语言回复，不要用JSON格式。

核心原则：
- 严格基于提供的页面内容进行总结，不要杜撰、猜测或添加页面中不存在的信息
- 如果内容不足以判断某些信息，明确说明"页面内容未提及"
- 区分"页面明确说的"和"可能的推断"

格式要求：
- 先写一段总体概述
- 然后用 "**关键要点：**" 开头列出关键信息（每条用 "- " 开头）
- 如果是技术文章，用 "**核心技术：**" 列出技术点
- 最后用 "**时效性：**" 评估内容是否过时
- 使用中文回复`;

const STREAM_DETAILED_PROMPT = `你是一位资深内容分析师。请对给定网页内容进行深度、全面的分析。
请直接用自然语言回复，不要用JSON格式。

核心原则：
- 严格基于提供的页面内容进行分析，不要杜撰、猜测或添加页面中不存在的信息
- 只总结和分析页面实际提供的内容，不要编造不存在的论点或数据
- 如果内容不足以完成某项分析，明确说明"内容不足以判断"

格式要求：
- 先写不少于300字的详细分析
- 然后用 "**关键要点：**" 列出所有要点
- 用 "**核心概念：**" 列出关键术语及解释
- 用 "**价值分析：**" 分析内容的价值
- 用 "**行动建议：**" 给出建议
- 用 "**时效性：**" 评估新鲜度
- 用 "**适合人群：**" 说明目标读者
- 使用中文回复`;

const STREAM_FOLLOWUP_SYSTEM = `你是一位内容分析助手，正在帮助用户深入分析一篇网页内容。
请用自然语言回复，可以使用 **粗体**、- 列表等 Markdown 格式。使用中文回复。`;

const GROUP_SUMMARY_PROMPT = `你是一个内容分析专家。请为同一类别下的多个网页标签生成一个整体总结。

要求：
1. 概述这组标签的共同主题
2. 列出关键发现或信息
3. 指出哪些内容值得优先阅读
4. 指出哪些内容可能重复或过时
5. 使用中文回复

返回 JSON 格式：
{
  "group_summary": "整体总结",
  "themes": ["主题1", "主题2"],
  "priority_reads": [{"id": "标签ID", "reason": "推荐原因"}],
  "duplicates": [{"ids": ["ID1", "ID2"], "reason": "重复原因"}],
  "outdated": [{"id": "标签ID", "reason": "过时原因"}],
  "note_card": "适合导入笔记的 Markdown 格式摘要卡片"
}`;

const conversationStore = new Map();

function buildUserMessage(tab, detailed) {
  const maxLen = detailed ? 8000 : 4000;
  const content = tab.content || tab.title || '';
  const truncated = content.substring(0, maxLen);
  return `网页信息：
标题：${tab.title}
URL：${tab.url}
域名：${tab.domain}

内容：
${truncated}`;
}

export async function summarizeTab(tab, { detailed = false, model } = {}) {
  const ai = getAIProvider(model);

  const content = tab.content || tab.title || '';
  if (!content.trim()) {
    return { summary: '无法获取内容', key_points: [], reading_time_min: 0, freshness: 'unknown' };
  }

  const prompt = detailed ? DETAILED_SUMMARY_PROMPT : SINGLE_SUMMARY_PROMPT;
  const userMessage = buildUserMessage(tab, detailed);

  try {
    const response = await ai.chat(prompt, userMessage, { json: true });
    const result = JSON.parse(response);

    queries.updateTabSummary(result.summary, tab.id);
    if (result.reading_time_min) {
      queries.updateTabReadingTime(result.reading_time_min, tab.id);
    }

    const convId = `tab-${tab.id}-${Date.now()}`;
    conversationStore.set(convId, {
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response },
      ],
      tabId: tab.id,
      createdAt: Date.now(),
    });

    cleanOldConversations();

    return { ...result, conversationId: convId };
  } catch (err) {
    console.error(`[Summarizer] Tab ${tab.id} failed:`, err.message);
    const fallback = autoSummary(tab);
    queries.updateTabSummary(fallback.summary, tab.id);
    return fallback;
  }
}

export async function* summarizeTabStream(tab, { detailed = false, model } = {}) {
  const ai = getAIProvider(model);

  const content = tab.content || tab.title || '';
  if (!content.trim()) {
    yield '无法获取页面内容';
    return;
  }

  const prompt = detailed ? STREAM_DETAILED_PROMPT : STREAM_SUMMARY_PROMPT;
  const userMessage = buildUserMessage(tab, detailed);

  let fullText = '';
  try {
    for await (const chunk of ai.chatStream(prompt, userMessage)) {
      fullText += chunk;
      yield chunk;
    }

    queries.updateTabSummary(fullText.substring(0, 500), tab.id);

    const convId = `tab-${tab.id}-${Date.now()}`;
    conversationStore.set(convId, {
      messages: [
        { role: 'system', content: STREAM_FOLLOWUP_SYSTEM },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: fullText },
      ],
      tabId: tab.id,
      createdAt: Date.now(),
    });
    cleanOldConversations();

    yield `\n\n<!--CONV:${convId}-->`;
  } catch (err) {
    console.error(`[Summarizer] Stream tab ${tab.id} failed:`, err.message);
    yield `\n\n错误: ${err.message}`;
  }
}

export async function followUp(conversationId, question, { model } = {}) {
  const conv = conversationStore.get(conversationId);
  if (!conv) return { error: '会话已过期，请重新总结' };

  const ai = getAIProvider(model);

  conv.messages.push({ role: 'user', content: question });

  try {
    const response = await ai.chat(null, null, { messages: conv.messages });
    conv.messages.push({ role: 'assistant', content: response });
    return { answer: response, conversationId };
  } catch (err) {
    conv.messages.pop();
    return { error: err.message };
  }
}

export async function* followUpStream(conversationId, question, { model } = {}) {
  const conv = conversationStore.get(conversationId);
  if (!conv) {
    yield '会话已过期，请重新总结';
    return;
  }

  const ai = getAIProvider(model);
  conv.messages.push({ role: 'user', content: question });

  let fullText = '';
  try {
    for await (const chunk of ai.chatStream(null, null, { messages: conv.messages })) {
      fullText += chunk;
      yield chunk;
    }
    conv.messages.push({ role: 'assistant', content: fullText });
  } catch (err) {
    conv.messages.pop();
    yield `\n\n错误: ${err.message}`;
  }
}

function cleanOldConversations() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, conv] of conversationStore) {
    if (conv.createdAt < cutoff) conversationStore.delete(id);
  }
}

export async function summarizeGroup(categoryId, { model } = {}) {
  const ai = getAIProvider(model);
  const tabs = queries.getTabsByCategory.all(categoryId);

  if (tabs.length === 0) {
    return { group_summary: '此分类下没有标签', themes: [], priority_reads: [], duplicates: [], outdated: [] };
  }

  const tabInfos = tabs.map(t => ({
    id: t.id,
    title: t.title,
    url: t.url,
    domain: t.domain,
    summary: t.summary || '',
    excerpt: (t.content || '').substring(0, 500),
    age_days: t.first_seen_at ? Math.floor((Date.now() - new Date(t.first_seen_at).getTime()) / 86400000) : 0,
  }));

  const userMessage = `分类下共 ${tabs.length} 个标签：

${JSON.stringify(tabInfos, null, 2)}`;

  try {
    const response = await ai.chat(GROUP_SUMMARY_PROMPT, userMessage, { json: true });
    return JSON.parse(response);
  } catch (err) {
    console.error(`[Summarizer] Group ${categoryId} failed:`, err.message);
    return {
      group_summary: `此分类包含 ${tabs.length} 个标签，涵盖 ${new Set(tabs.map(t => t.domain)).size} 个不同域名。`,
      themes: [...new Set(tabs.map(t => t.domain))].slice(0, 5),
      priority_reads: [],
      duplicates: [],
      outdated: [],
    };
  }
}

function autoSummary(tab) {
  const words = (tab.content || tab.title || '').length;
  const readingTime = Math.max(1, Math.ceil(words / 500));
  return {
    summary: tab.title || '无标题',
    key_points: [],
    reading_time_min: readingTime,
    freshness: 'unknown',
  };
}
