import { tool } from 'ai';
import { z } from 'zod';
import { listTabs, getTabById, batchUpdateStatus } from '../db/tab-repo.js';
import { categorizeTabs, applyClassifications } from './categorizer.js';
import { exportTab, type ExportTarget, type ExportDepth } from './export.service.js';

export const agentTools = {
  search_tabs: tool({
    description: '搜索标签。可按关键词、分类、域名搜索。返回匹配的标签列表。',
    inputSchema: z.object({
      query: z.string().optional().describe('搜索关键词'),
      topic: z.string().optional().describe('按分类筛选（如 tech, news, design）'),
      domain: z.string().optional().describe('按域名筛选'),
      status: z.string().optional().describe('按状态筛选（active, exported, closed）'),
      limit: z.number().optional().describe('返回数量限制，默认20'),
    }),
    execute: async (args) => {
      const { tabs, total } = listTabs({
        search: args.query,
        topic: args.topic,
        domain: args.domain,
        status: args.status,
        limit: args.limit || 20,
      });
      const simplified = tabs.map(t => ({
        id: t.id, title: t.title, url: t.url, domain: t.domain,
        topic: t.topic,
        tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags,
        status: t.status,
        ai_summary: t.ai_summary?.substring(0, 100),
      }));
      return {
        tabs: simplified, total,
        display: `找到 ${total} 个标签${args.query ? `（关键词: ${args.query}）` : ''}`,
      };
    },
  }),

  list_tabs_summary: tool({
    description: '获取当前标签概况统计。包括总数、各分类数量、各状态数量。',
    inputSchema: z.object({}),
    execute: async () => {
      const all = listTabs({ limit: 5000 });
      const statusCounts: Record<string, number> = {};
      const topicCounts: Record<string, number> = {};
      for (const t of all.tabs) {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
        if (t.topic) topicCounts[t.topic] = (topicCounts[t.topic] || 0) + 1;
      }
      return {
        total: all.total, byStatus: statusCounts, byTopic: topicCounts,
        display: `共 ${all.total} 个标签，${Object.keys(topicCounts).length} 个分类`,
      };
    },
  }),

  save_note: tool({
    description: '将指定标签保存为笔记到 Apple Notes 或 Obsidian。',
    inputSchema: z.object({
      tabId: z.string().describe('标签ID'),
      target: z.enum(['apple_notes', 'obsidian']).describe('导出目标'),
      folder: z.string().optional().describe('文件夹路径'),
      depth: z.enum(['light', 'standard', 'full']).optional().describe('导出深度'),
    }),
    execute: async (args) => {
      const result = await exportTab({
        tabId: args.tabId,
        target: args.target as ExportTarget,
        depth: (args.depth as ExportDepth) || 'standard',
        folder: args.folder,
      });
      return {
        ...result,
        display: result.success
          ? `✅ 已保存到 ${args.target === 'obsidian' ? 'Obsidian' : 'Apple Notes'}`
          : `❌ 保存失败: ${result.error}`,
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
      const tabs = args.tabIds.map(id => getTabById(id)).filter(Boolean);
      const chromeTabIds = tabs.map(t => (t as any).source_tab_id).filter((id: any) => typeof id === 'number' && id > 0);
      const count = batchUpdateStatus(args.tabIds, 'closed');
      return {
        closedCount: count,
        action: 'close_chrome_tabs',
        chromeTabIds,
        display: `已关闭 ${count} 个标签`,
      };
    },
  }),

  classify_tab: tool({
    description: '对指定标签进行AI分类。',
    inputSchema: z.object({
      tabIds: z.array(z.string()).describe('要分类的标签ID列表'),
    }),
    execute: async (args) => {
      const tabs = args.tabIds.map((id: string) => getTabById(id)).filter(Boolean);
      if (!tabs.length) return { error: 'No tabs found', display: '未找到指定标签' };

      const { classifications } = await categorizeTabs(
        tabs.map((t: any) => ({ id: t.id, url: t.url, title: t.title, domain: t.domain, content_text: t.content_text })),
      );
      applyClassifications(classifications);
      return {
        classified: Object.keys(classifications).length,
        display: `已分类 ${Object.keys(classifications).length} 个标签`,
      };
    },
  }),

  get_tab_detail: tool({
    description: '获取指定标签的详细信息，包括摘要、分类、评分等。',
    inputSchema: z.object({
      tabId: z.string().describe('标签ID'),
    }),
    execute: async (args) => {
      const tab = getTabById(args.tabId);
      if (!tab) return { error: 'Tab not found', display: '未找到标签' };
      const tags = typeof tab.tags === 'string' ? JSON.parse(tab.tags) : tab.tags;
      return {
        id: tab.id, title: tab.title, url: tab.url, domain: tab.domain,
        topic: tab.topic, tags, status: tab.status,
        ai_summary: tab.ai_summary,
        user_score: tab.user_score,
        content_text: tab.content_text?.substring(0, 500),
        display: `📑 ${tab.title}`,
      };
    },
  }),
};
