import { streamText, stepCountIs } from 'ai';
import { getModel, type AIConfig } from './ai-client';
import { agentTools } from './agent-tools';

const SUMMARY_SYSTEM = `你是一个笔记助手。为给定网页内容写一份中文摘要笔记。

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

const DETAILED_SUMMARY_SYSTEM = `你是一个深度笔记助手。对给定网页内容做一份详细的中文分析笔记。

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

const CHAT_SYSTEM = `你是 MindShelf AI 助手，一位智能标签管理和知识整理专家。
你可以帮助用户：
- 分析和整理浏览器标签
- 回答关于已保存标签/网页的问题
- 提供内容摘要和知识整理建议
- 协助批量标签管理操作

如果系统注入了当前页面内容，直接基于该内容回答用户的提问。
使用中文回复，Markdown 格式。简洁有帮助。`;

function buildAgentSystem(maxSteps: number) {
  return `你是 MindShelf 助手，帮用户管理浏览器标签和整理知识。

可用工具：
- search_tabs: 搜索标签（支持多关键词，空格/逗号分隔）
- list_tabs_summary: 标签统计概况
- detect_duplicates: 检测重复标签
- save_note: 保存到 Apple Notes / Obsidian
- close_tabs: 关闭标签
- get_tab_detail: 查看指定标签详情
- get_page_content: 获取当前页面完整文本（无需参数）

使用规则：
- 用户要求操作时，直接调用工具，不要询问确认
- 操作完成后简短告知结果
- 用中文回复，Markdown 格式
- 说话简洁直接，不要啰嗦

效率规则：
- 你最多可调用 ${maxSteps} 轮工具，请合理规划，尽量一轮多工具并行调用
- 优先用一次 search_tabs（多关键词）代替多次单关键词搜索
- 如果任务可能超出轮数限制，先完成最关键的部分，告知用户剩余部分

当前页面规则：
- 系统已在下方注入当前页面上下文（标题、URL，可能包含内容摘要）
- 涉及当前页面的问题，优先基于已注入内容直接回答
- 仅在已注入内容不足时，调用 get_page_content 获取完整内容
- 禁止用 search_tabs / get_tab_detail 查找当前页面`;
}

const NOTE_OPTIMIZE_SYSTEM = `你是笔记整理助手。输出干净的 Markdown。
写作要求：像人类笔记者书写，简洁直接，禁止"综上所述""总的来说""值得注意的是"等AI套话。不要用"本文""该文章"等指代。
只输出笔记内容，不要输出元数据。`;

export interface PageContext {
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  contentExcerpt?: string;
}

export function buildSystemPrompt(
  base: string,
  pageContext?: PageContext | null,
): string {
  let prompt = base;
  if (pageContext) {
    prompt += `\n\n## 当前页面上下文\n用户正在浏览：\n- 标题：${pageContext.title}\n- URL：${pageContext.url}\n- 域名：${pageContext.domain}`;
    if (pageContext.contentExcerpt) {
      prompt += `\n\n<page_content>\n${pageContext.contentExcerpt}\n</page_content>`;
    }
  }
  return prompt;
}

export interface ChatStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'error' | 'finish';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: string;
  display?: string;
  error?: unknown;
}

/**
 * Stream a chat message. In agent mode, yields tool events alongside text.
 */
export async function* streamChatMessage(
  history: Array<{ role: string; content: string }>,
  config: AIConfig,
  opts: { pageContext?: PageContext | null; agentMode?: boolean; abortSignal?: AbortSignal; maxSteps?: number } = {},
): AsyncGenerator<ChatStreamEvent> {
  const maxSteps = opts.maxSteps ?? 5;
  const baseSystem = opts.agentMode ? buildAgentSystem(maxSteps) : CHAT_SYSTEM;
  const system = buildSystemPrompt(baseSystem, opts.pageContext);
  const model = getModel(config);

  const messages = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  const result = streamText({
    model,
    system,
    messages,
    ...(opts.agentMode ? { tools: agentTools, stopWhen: stepCountIs(maxSteps) } : {}),
    temperature: 0.3,
    abortSignal: opts.abortSignal,
    onError: () => {},
  });

  let inReasoning = false;
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        yield { type: 'text-delta', text: part.text };
        break;

      case 'reasoning-start':
        inReasoning = true;
        yield { type: 'text-delta', text: '<think>\n' };
        break;

      case 'reasoning-delta':
        yield { type: 'text-delta', text: part.text };
        break;

      case 'reasoning-end':
        inReasoning = false;
        yield { type: 'text-delta', text: '\n</think>\n' };
        break;

      case 'tool-call':
        if (inReasoning) {
          inReasoning = false;
          yield { type: 'text-delta', text: '\n</think>\n' };
        }
        yield {
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: JSON.stringify(part.input),
        };
        break;

      case 'tool-result':
        yield {
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          display:
            (part.output as any)?.display ??
            JSON.stringify(part.output ?? '').substring(0, 200),
        };
        break;

      case 'tool-error': {
        const te = part as any;
        yield {
          type: 'tool-result',
          toolCallId: te.toolCallId,
          toolName: te.toolName,
          display: `Error: ${te.error ?? 'tool execution failed'}`,
        };
        break;
      }

      case 'error':
        yield { type: 'error', error: part.error };
        break;
    }
  }

  yield { type: 'finish' };
}

export async function* streamSummarize(
  tab: { title: string; url: string; domain: string; content_text?: string | null },
  config: AIConfig,
  opts: { detailed?: boolean } = {},
): AsyncGenerator<string> {
  const content = tab.content_text || tab.title || '';
  if (!content.trim()) {
    yield '无法获取页面内容';
    return;
  }

  const maxLen = opts.detailed ? 8000 : 4000;
  const truncated = content.substring(0, maxLen);
  const userMessage = `网页信息：\n标题：${tab.title}\nURL：${tab.url}\n域名：${tab.domain}\n\n内容：\n${truncated}`;
  const system = opts.detailed ? DETAILED_SUMMARY_SYSTEM : SUMMARY_SYSTEM;
  const model = getModel(config);

  const result = streamText({
    model,
    system,
    messages: [{ role: 'user' as const, content: userMessage }],
    temperature: 0.3,
    onError: () => {},
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') yield part.text;
    if (part.type === 'reasoning-delta') yield part.text;
    if (part.type === 'error') throw part.error;
  }
}

export async function* streamNoteOptimize(
  instruction: string,
  currentMarkdown: string,
  tabInfo: { title: string; url: string; topic?: string | null; tags?: string[] },
  config: AIConfig,
  opts: { stylePrompt?: string } = {},
): AsyncGenerator<string> {
  const system = opts.stylePrompt
    ? `${NOTE_OPTIMIZE_SYSTEM}\n${opts.stylePrompt}`
    : NOTE_OPTIMIZE_SYSTEM;

  const context = [
    `网页：${tabInfo.title}`,
    `URL：${tabInfo.url}`,
    tabInfo.topic ? `分类：${tabInfo.topic}` : '',
    tabInfo.tags?.length ? `标签：${tabInfo.tags.join(', ')}` : '',
    `\n当前笔记内容：\n${currentMarkdown.substring(0, 12000)}`,
    `\n---\n指令：${instruction}`,
  ]
    .filter(Boolean)
    .join('\n');

  const model = getModel(config);
  const result = streamText({
    model,
    system,
    messages: [{ role: 'user' as const, content: context }],
    temperature: 0.3,
    onError: () => {},
  });

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') yield part.text;
    if (part.type === 'reasoning-delta') yield part.text;
    if (part.type === 'error') throw part.error;
  }
}
