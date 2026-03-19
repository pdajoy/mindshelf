import { streamText, stepCountIs } from 'ai';
import { getModel, type AIConfig } from './ai-client';
import { agentTools } from './agent-tools';

const SUMMARY_SYSTEM = `You are a note-taking assistant. Write a concise summary of the given web page content.

Style:
- Write like a human taking notes, not an AI generating a report
- Be concise and direct, use short sentences
- No filler phrases like "In conclusion", "It's worth noting", "Overall"
- Don't write "This article discusses..." — jump straight to content

Format:
- One paragraph core summary (2-3 sentences)
- Key takeaways (bullet list)
- For technical content, list key terms
- Strictly based on source material, no fabrication
- Respond in the same language as the page content`;

const DETAILED_SUMMARY_SYSTEM = `You are a deep research note assistant. Create a detailed analytical note of the given web page content.

Style:
- Write like a senior researcher taking notes
- Preserve key terminology and concepts from the original
- No filler phrases
- Jump straight to content

Format:
- Core content (detailed analysis, at least 300 words)
- Key takeaways (bullet list)
- Core concepts/terminology (with brief explanations)
- Practical value (how this information can be used)
- Strictly based on source material, mark gaps as "not covered in source"
- Respond in the same language as the page content`;

const CHAT_SYSTEM = `You are MindShelf AI assistant, an intelligent tab management and knowledge organization expert.
You can help users:
- Analyze and organize browser tabs
- Answer questions about saved tabs/web pages
- Provide content summaries and knowledge organization suggestions
- Assist with batch tab management operations

If the system has injected current page content, answer the user's questions based on that content directly.
Reply in the user's language. Use Markdown formatting. Be concise and helpful.`;

function buildAgentSystem(maxSteps: number) {
  return `You are MindShelf assistant, helping users manage browser tabs and organize knowledge.

Available tools:
- search_tabs: Search tabs (supports multiple keywords, space/comma separated)
- list_tabs_summary: Tab statistics overview
- detect_duplicates: Detect duplicate tabs
- save_note: Save to Apple Notes / Obsidian
- close_tabs: Close tabs
- get_tab_detail: Get specific tab details
- get_page_content: Get current page full text (no args needed)

Usage rules:
- When user requests an action, call tools directly without asking for confirmation
- After completing an action, briefly report the result
- Reply in the user's language, use Markdown formatting
- Be concise and direct

Efficiency rules:
- You can call up to ${maxSteps} tool rounds. Plan accordingly, prefer parallel calls in one round.
- Prefer one search_tabs call with multiple keywords over multiple single-keyword searches
- If the task may exceed the round limit, complete the most critical part first, then inform the user about remaining work

Current page rules:
- The system has injected current page context below (title, URL, possibly content excerpt)
- For questions about the current page, prioritize answering from injected content
- Only call get_page_content when injected content is insufficient
- Do NOT use search_tabs / get_tab_detail to find the current page`;
}

const NOTE_OPTIMIZE_SYSTEM = `You are a note optimization assistant. Output clean Markdown.
Style: write like a human note-taker, concise and direct. No AI boilerplate phrases.
Only output note content, no metadata. Respond in the same language as the input.`;

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
    prompt += `\n\n## Current Page Context\nUser is browsing:\n- Title: ${pageContext.title}\n- URL: ${pageContext.url}\n- Domain: ${pageContext.domain}`;
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
    yield 'Unable to get page content';
    return;
  }

  const maxLen = opts.detailed ? 8000 : 4000;
  const truncated = content.substring(0, maxLen);
  const userMessage = `Page info:\nTitle: ${tab.title}\nURL: ${tab.url}\nDomain: ${tab.domain}\n\nContent:\n${truncated}`;
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
    `Page: ${tabInfo.title}`,
    `URL: ${tabInfo.url}`,
    tabInfo.topic ? `Category: ${tabInfo.topic}` : '',
    tabInfo.tags?.length ? `Tags: ${tabInfo.tags.join(', ')}` : '',
    `\nCurrent note content:\n${currentMarkdown.substring(0, 12000)}`,
    `\n---\nInstruction: ${instruction}`,
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
