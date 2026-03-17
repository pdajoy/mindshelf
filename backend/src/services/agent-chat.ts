import { streamText, stepCountIs } from 'ai';
import { getModel } from './ai-provider.js';
import { agentTools } from './agent-tools.js';

const AGENT_SYSTEM = `你是 MindShelf 助手，帮用户管理浏览器标签和整理知识。

可用工具：
- search_tabs: 搜索标签（按关键词、分类、域名）
- list_tabs_summary: 标签统计概况
- save_note: 保存到 Apple Notes / Obsidian
- close_tabs: 关闭标签
- classify_tab: AI 分类
- get_tab_detail: 查看详情

使用规则：
- 用户要求操作时，直接调用工具，不要询问确认
- 操作完成后简短告知结果
- 用中文回复，Markdown 格式
- 说话简洁直接，不要啰嗦`;

export async function* agentChatStream(
  messages: Array<{ role: string; content: string }>,
  opts: { model?: string } = {},
): AsyncGenerator<{ type: string; [key: string]: unknown }> {
  const model = getModel(opts.model);

  const result = streamText({
    model,
    system: AGENT_SYSTEM,
    messages: messages as any,
    tools: agentTools,
    stopWhen: stepCountIs(5),
    temperature: 0.3,
  });

  let lastEventType = '';

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        lastEventType = 'chunk';
        yield { type: 'chunk', content: part.text };
        break;

      case 'tool-call':
        lastEventType = 'tool_call';
        yield {
          type: 'tool_call',
          name: part.toolName,
          args: JSON.stringify(part.input),
          toolCallId: part.toolCallId,
        };
        break;

      case 'tool-result':
        lastEventType = 'tool_result';
        yield {
          type: 'tool_result',
          name: part.toolName,
          display: (part.output as any)?.display ?? JSON.stringify(part.output).substring(0, 200),
          toolCallId: part.toolCallId,
          action: (part.output as any)?.action,
          chromeTabIds: (part.output as any)?.chromeTabIds,
        };
        break;
    }
  }

  if (lastEventType !== 'chunk') {
    yield { type: 'done' };
  }
}
