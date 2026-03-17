import { streamText } from 'ai';
import { getModel } from './ai-provider.js';
import { updateTab } from '../db/tab-repo.js';
import { randomUUID } from 'crypto';

const STREAM_SUMMARY_PROMPT = `你是一个笔记助手。为给定网页内容写一份中文摘要笔记。

写作风格：
- 像人在写笔记，不是AI在做总结
- 简洁直接，用短句
- 禁止使用：综上所述、总的来说、值得注意的是、需要指出的是、本文、该文章
- 不要写"这篇文章讲了..."这类引导句，直接写内容

格式：
- 一段话概括核心（2-3句）
- 关键要点（用 - 列表）
- 技术文章额外列出关键术语
- 严格基于原文，不编造`;

const STREAM_DETAILED_PROMPT = `你是一个深度笔记助手。对给定网页内容做一份详细的中文分析笔记。

写作风格：
- 像资深研究员在做笔记，不是AI在写报告
- 保留原文关键术语和概念，不要用通用描述替换专业词汇
- 禁止使用：综上所述、总的来说、值得注意的是、需要指出的是、不难看出
- 不要写"这篇文章讲了..."，直接切入内容

格式：
- 核心内容（详细分析，至少300字）
- 关键要点（列表）
- 核心概念/术语（附简短解释）
- 实用价值（这些信息可以怎么用）
- 严格基于原文，不足的地方标注"原文未涉及"`;

const FOLLOWUP_SYSTEM = `你是一位内容分析助手，正在帮助用户深入分析一篇网页内容。
请用自然语言回复，可以使用 **粗体**、- 列表等 Markdown 格式。使用中文回复。`;

interface TabInput {
  id: string;
  url: string;
  title: string;
  domain: string;
  content_text?: string | null;
}

function buildUserMessage(tab: TabInput, detailed: boolean): string {
  const maxLen = detailed ? 8000 : 4000;
  const content = tab.content_text || tab.title || '';
  const truncated = content.substring(0, maxLen);
  return `网页信息：
标题：${tab.title}
URL：${tab.url}
域名：${tab.domain}

内容：
${truncated}`;
}

// ---- In-memory conversation store (TTL: 2 hours) ----
interface ConvEntry {
  messages: Array<{ role: string; content: string }>;
  tabId: string;
  createdAt: number;
}

const conversations = new Map<string, ConvEntry>();
const CONV_TTL_MS = 2 * 60 * 60 * 1000;

function pruneConversations() {
  const now = Date.now();
  for (const [id, entry] of conversations) {
    if (now - entry.createdAt > CONV_TTL_MS) conversations.delete(id);
  }
}

function saveConversation(tabRecordId: string, messages: Array<{ role: string; content: string }>): string {
  pruneConversations();
  const id = randomUUID();
  conversations.set(id, { messages, tabId: tabRecordId, createdAt: Date.now() });
  return id;
}

export async function* summarizeTabStream(
  tab: TabInput,
  opts: { detailed?: boolean; model?: string } = {}
): AsyncGenerator<string> {
  const content = tab.content_text || tab.title || '';
  if (!content.trim()) {
    yield '无法获取页面内容';
    return;
  }

  const prompt = opts.detailed ? STREAM_DETAILED_PROMPT : STREAM_SUMMARY_PROMPT;
  const userMessage = buildUserMessage(tab, !!opts.detailed);

  let fullText = '';
  try {
    const result = streamText({
      model: getModel(opts.model),
      system: prompt,
      prompt: userMessage,
      temperature: 0.3,
    });

    for await (const chunk of result.textStream) {
      fullText += chunk;
      yield chunk;
    }

    updateTab(tab.id, {
      ai_summary: fullText.substring(0, 1000),
      ...(opts.detailed ? { ai_detailed_summary: fullText } : {}),
    } as any);

    const convId = saveConversation(tab.id, [
      { role: 'system', content: FOLLOWUP_SYSTEM },
      { role: 'user', content: userMessage },
      { role: 'assistant', content: fullText },
    ]);

    yield `\n\n<!--CONV:${convId}-->`;
  } catch (err) {
    console.error(`[Summarizer] Stream failed for ${tab.id}:`, (err as Error).message);
    yield `\n\n错误: ${(err as Error).message}`;
  }
}

export async function* followUpStream(
  conversationId: string,
  question: string,
  opts: { model?: string } = {}
): AsyncGenerator<string> {
  const entry = conversations.get(conversationId);
  if (!entry) {
    yield '会话已过期，请重新总结';
    return;
  }

  entry.messages.push({ role: 'user', content: question });

  let fullText = '';
  try {
    const result = streamText({
      model: getModel(opts.model),
      messages: entry.messages as any,
      temperature: 0.3,
    });

    for await (const chunk of result.textStream) {
      fullText += chunk;
      yield chunk;
    }

    entry.messages.push({ role: 'assistant', content: fullText });
  } catch (err) {
    entry.messages.pop();
    yield `\n\n错误: ${(err as Error).message}`;
  }
}

const GENERAL_CHAT_SYSTEM = `你是 MindShelf AI 助手，一位智能标签管理和知识整理专家。
你可以帮助用户：
- 分析和整理浏览器标签
- 回答关于已保存标签/网页的问题
- 提供内容摘要和知识整理建议
- 协助批量标签管理操作

使用中文回复，可以使用 Markdown 格式。保持简洁有帮助的风格。`;

export async function* chatStreamGeneral(
  messages: Array<{ role: string; content: string }>,
  opts: { model?: string } = {}
): AsyncGenerator<string> {
  const fullMessages = [
    { role: 'system' as const, content: GENERAL_CHAT_SYSTEM },
    ...messages,
  ];

  const result = streamText({
    model: getModel(opts.model),
    messages: fullMessages as any,
    temperature: 0.3,
  });

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
