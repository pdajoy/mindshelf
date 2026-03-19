import { tool } from 'ai';
import { z } from 'zod';
import { useTabStore } from '@/entrypoints/sidepanel/stores/tab-store';
import { getBackendAvailable } from './backend-status';
import { api } from './api';

function getTabs() {
  return useTabStore.getState().tabs;
}

export const agentTools = {
  search_tabs: tool({
    description: '搜索标签。可按多个关键词（空格或逗号分隔）、分类、域名搜索。返回匹配的标签列表。',
    inputSchema: z.object({
      query: z.string().optional().describe('搜索关键词，支持多个（空格或逗号分隔），匹配标题、域名、摘要、标签'),
      topic: z.string().optional().describe('按分类筛选（如 ai-ml, programming, security）'),
      domain: z.string().optional().describe('按域名筛选'),
      limit: z.number().optional().describe('返回数量限制，默认20'),
    }),
    execute: async (args) => {
      let results = getTabs();
      if (args.query) {
        const keywords = args.query.split(/[,，\s]+/).filter(Boolean).map(k => k.toLowerCase());
        results = results.filter((t) => {
          const hay = `${t.title} ${t.domain} ${t.ai_summary || ''} ${t.tags.join(' ')}`.toLowerCase();
          return keywords.some(k => hay.includes(k));
        });
      }
      if (args.topic) {
        results = results.filter((t) => t.topic === args.topic);
      }
      if (args.domain) {
        const d = args.domain.toLowerCase();
        results = results.filter((t) => t.domain.toLowerCase().includes(d));
      }
      const limit = args.limit || 20;
      const total = results.length;
      results = results.slice(0, limit);
      const simplified = results.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        domain: t.domain,
        topic: t.topic,
        tags: t.tags,
        status: t.status,
        ai_summary: t.ai_summary?.substring(0, 100),
      }));
      return {
        tabs: simplified,
        total,
        display: `找到 ${total} 个标签${args.query ? `（关键词: ${args.query}）` : ''}`,
      };
    },
  }),

  list_tabs_summary: tool({
    description: '获取当前标签概况统计。包括总数、各分类数量。',
    inputSchema: z.object({}),
    execute: async () => {
      const tabs = getTabs();
      const topicCounts: Record<string, number> = {};
      const domainCounts: Record<string, number> = {};
      for (const t of tabs) {
        if (t.topic) topicCounts[t.topic] = (topicCounts[t.topic] || 0) + 1;
        domainCounts[t.domain] = (domainCounts[t.domain] || 0) + 1;
      }
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([d, c]) => `${d}(${c})`);
      return {
        total: tabs.length,
        byTopic: topicCounts,
        topDomains,
        display: `共 ${tabs.length} 个标签，${Object.keys(topicCounts).length} 个分类`,
      };
    },
  }),

  close_tabs: tool({
    description: '关闭指定的标签页。传入标签ID数组。',
    inputSchema: z.object({
      tabIds: z.array(z.string()).describe('要关闭的标签ID列表'),
      reason: z.string().optional().describe('关闭原因'),
    }),
    execute: async (args) => {
      const allTabs = getTabs();
      const chromeTabIds: number[] = [];
      for (const id of args.tabIds) {
        const tab = allTabs.find((t) => t.id === id);
        if (tab?.source_tab_id && tab.source_tab_id > 0) {
          chromeTabIds.push(tab.source_tab_id);
        }
      }
      let closedCount = 0;
      if (chromeTabIds.length > 0) {
        try {
          await chrome.tabs.remove(chromeTabIds);
          closedCount = chromeTabIds.length;
        } catch (e) {
          console.error('[AgentTools] close_tabs error:', e);
        }
      }
      for (const id of args.tabIds) {
        useTabStore.getState().removeTab(id);
      }
      return {
        closedCount,
        display: `已关闭 ${closedCount} 个标签`,
      };
    },
  }),

  get_tab_detail: tool({
    description: '获取指定标签的详细信息，包括摘要、分类、评分等。',
    inputSchema: z.object({
      tabId: z.string().describe('标签ID'),
    }),
    execute: async (args) => {
      const tab = getTabs().find((t) => t.id === args.tabId);
      if (!tab) return { error: 'Tab not found', display: '未找到标签' };
      return {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        domain: tab.domain,
        topic: tab.topic,
        tags: tab.tags,
        status: tab.status,
        ai_summary: tab.ai_summary,
        user_score: tab.user_score,
        content_text: tab.content_text?.substring(0, 500),
        display: `📑 ${tab.title}`,
      };
    },
  }),

  detect_duplicates: tool({
    description: '检测当前标签中的重复项。返回重复标签组及原因（完全相同URL、相似标题等）。',
    inputSchema: z.object({}),
    execute: async () => {
      const { detectDuplicates } = await import('@/lib/duplicate-detector');
      const groups = detectDuplicates(getTabs());
      if (!groups.length) return { total: 0, groups: [], display: '未发现重复标签' };
      return {
        total: groups.length,
        totalDuplicateTabs: groups.reduce((s, g) => s + g.tabs.length, 0),
        groups: groups.map(g => ({
          reason: g.reason,
          similarity: g.similarity,
          tabs: g.tabs.map(t => ({ id: t.id, title: t.title, url: t.url })),
        })),
        display: `发现 ${groups.length} 组重复标签（共 ${groups.reduce((s, g) => s + g.tabs.length, 0)} 个）`,
      };
    },
  }),

  get_page_content: tool({
    description: '获取当前活跃页面的完整文本内容。用于需要深入分析或总结当前页面时。无需参数。',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
          return { content: '', display: '无法获取页面内容（非网页标签）' };
        }

        try {
          const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT_CS' });
          if (result?.content_text) {
            const content = result.content_text.substring(0, 8000);
            return { title: tab.title, url: tab.url, content, display: `已获取页面内容（${content.length} 字）` };
          }
        } catch { /* content script not ready */ }

        try {
          const htmlResult = await chrome.runtime.sendMessage({ type: 'EXTRACT_HTML', tabId: tab.id });
          if (htmlResult?.html) {
            const { extractFromHTML } = await import('@/lib/content-extractor');
            const extracted = extractFromHTML(htmlResult.html, tab.url || '', 'readability');
            const text = extracted.plainText || extracted.markdown || '';
            if (text) {
              const content = text.substring(0, 8000);
              return { title: tab.title, url: tab.url, content, display: `已获取页面内容（${content.length} 字）` };
            }
          }
        } catch { /* html extraction failed */ }

        return { content: '', display: '无法提取页面内容' };
      } catch {
        return { content: '', display: '获取页面内容失败' };
      }
    },
  }),

  save_note: tool({
    description: '将指定标签保存为笔记到 Apple Notes 或 Obsidian（需要后端服务运行）。',
    inputSchema: z.object({
      tabId: z.string().describe('标签ID'),
      target: z.enum(['apple_notes', 'obsidian']).describe('导出目标'),
      folder: z.string().optional().describe('文件夹路径'),
    }),
    execute: async (args) => {
      if (!getBackendAvailable()) {
        return {
          success: false,
          display: '⚠️ 后端服务未运行，无法导出。请使用界面上的"保存笔记"按钮下载 Markdown。',
        };
      }
      const tab = getTabs().find(t => t.id === args.tabId);
      if (!tab) return { success: false, display: '❌ 未找到标签' };
      try {
        const result = await api.export.single({
          title: tab.title,
          url: tab.url,
          domain: tab.domain,
          topic: tab.topic || undefined,
          tags: tab.tags,
          content: tab.ai_summary || tab.content_text?.substring(0, 30000) || '暂无内容',
          target: args.target,
          folder: args.folder,
        });
        return {
          ...result,
          display: result.success
            ? `✅ 已保存到 ${args.target === 'obsidian' ? 'Obsidian' : 'Apple Notes'}`
            : `❌ 保存失败: ${result.error}`,
        };
      } catch (e) {
        return { success: false, display: `❌ 导出失败: ${(e as Error).message}` };
      }
    },
  }),
};
