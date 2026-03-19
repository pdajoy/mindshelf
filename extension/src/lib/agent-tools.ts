import { tool } from 'ai';
import { z } from 'zod';
import { useTabStore } from '@/entrypoints/sidepanel/stores/tab-store';
import { getBackendAvailable } from './backend-status';
import { api } from './api';
import i18next from 'i18next';

const t = i18next.t.bind(i18next);

function getTabs() {
  return useTabStore.getState().tabs;
}

export const agentTools = {
  search_tabs: tool({
    description: 'Search tabs by multiple keywords (space or comma separated), category, or domain. Returns matching tab list.',
    inputSchema: z.object({
      query: z.string().optional().describe('Search keywords (space/comma separated), matches title, domain, summary, tags'),
      topic: z.string().optional().describe('Filter by category (e.g. ai-ml, programming, security)'),
      domain: z.string().optional().describe('Filter by domain'),
      limit: z.number().optional().describe('Result limit, default 20'),
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
        display: args.query
          ? t('tool.foundWithKw', { count: total, keywords: args.query })
          : t('tool.found', { count: total }),
      };
    },
  }),

  list_tabs_summary: tool({
    description: 'Get current tab overview statistics. Includes total count, category counts.',
    inputSchema: z.object({}),
    execute: async () => {
      const tabs = getTabs();
      const topicCounts: Record<string, number> = {};
      const domainCounts: Record<string, number> = {};
      for (const tab of tabs) {
        if (tab.topic) topicCounts[tab.topic] = (topicCounts[tab.topic] || 0) + 1;
        domainCounts[tab.domain] = (domainCounts[tab.domain] || 0) + 1;
      }
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([d, c]) => `${d}(${c})`);
      return {
        total: tabs.length,
        byTopic: topicCounts,
        topDomains,
        display: t('tool.totalTabs', { count: tabs.length, categories: Object.keys(topicCounts).length }),
      };
    },
  }),

  close_tabs: tool({
    description: 'Close specified browser tabs. Pass an array of tab IDs.',
    inputSchema: z.object({
      tabIds: z.array(z.string()).describe('Array of tab IDs to close'),
      reason: z.string().optional().describe('Reason for closing'),
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
        display: t('tool.closed', { count: closedCount }),
      };
    },
  }),

  get_tab_detail: tool({
    description: 'Get detailed information for a specific tab, including summary, category, score, etc.',
    inputSchema: z.object({
      tabId: z.string().describe('Tab ID'),
    }),
    execute: async (args) => {
      const tab = getTabs().find((t) => t.id === args.tabId);
      if (!tab) return { error: 'Tab not found', display: t('tool.notFound') };
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
    description: 'Detect duplicate tabs. Returns duplicate groups and reasons (exact URL match, similar title, etc.).',
    inputSchema: z.object({}),
    execute: async () => {
      const { detectDuplicates } = await import('@/lib/duplicate-detector');
      const groups = detectDuplicates(getTabs());
      if (!groups.length) return { total: 0, groups: [], display: t('tool.noDuplicates') };
      return {
        total: groups.length,
        totalDuplicateTabs: groups.reduce((s, g) => s + g.tabs.length, 0),
        groups: groups.map(g => ({
          reason: g.reason,
          similarity: g.similarity,
          tabs: g.tabs.map(t => ({ id: t.id, title: t.title, url: t.url })),
        })),
        display: t('tool.duplicatesFound', { groups: groups.length, total: groups.reduce((s, g) => s + g.tabs.length, 0) }),
      };
    },
  }),

  get_page_content: tool({
    description: 'Get the full text content of the currently active browser tab. Used when deep analysis or summary of the current page is needed. No args required.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
          return { content: '', display: t('tool.cannotGetContent') };
        }

        try {
          const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT_CS' });
          if (result?.content_text) {
            const content = result.content_text.substring(0, 8000);
            return { title: tab.title, url: tab.url, content, display: t('tool.gotContent', { count: content.length }) };
          }
        } catch {}

        try {
          const htmlResult = await chrome.runtime.sendMessage({ type: 'EXTRACT_HTML', tabId: tab.id });
          if (htmlResult?.html) {
            const { extractFromHTML } = await import('@/lib/content-extractor');
            const extracted = extractFromHTML(htmlResult.html, tab.url || '', 'readability');
            const text = extracted.plainText || extracted.markdown || '';
            if (text) {
              const content = text.substring(0, 8000);
              return { title: tab.title, url: tab.url, content, display: t('tool.gotContent', { count: content.length }) };
            }
          }
        } catch {}

        return { content: '', display: t('tool.cannotExtract') };
      } catch {
        return { content: '', display: t('tool.extractFailed') };
      }
    },
  }),

  save_note: tool({
    description: 'Save a specific tab as a note to Apple Notes or Obsidian (requires backend service running).',
    inputSchema: z.object({
      tabId: z.string().describe('Tab ID'),
      target: z.enum(['apple_notes', 'obsidian']).describe('Export target'),
      folder: z.string().optional().describe('Folder path'),
    }),
    execute: async (args) => {
      if (!getBackendAvailable()) {
        return {
          success: false,
          display: t('tool.backendNotRunning'),
        };
      }
      const tab = getTabs().find(tab => tab.id === args.tabId);
      if (!tab) return { success: false, display: `❌ ${t('tool.notFound')}` };
      try {
        const result = await api.export.single({
          title: tab.title,
          url: tab.url,
          domain: tab.domain,
          topic: tab.topic || undefined,
          tags: tab.tags,
          content: tab.ai_summary || tab.content_text?.substring(0, 30000) || 'No content',
          target: args.target,
          folder: args.folder,
        });
        const targetLabel = args.target === 'obsidian' ? 'Obsidian' : 'Apple Notes';
        return {
          ...result,
          display: result.success
            ? t('tool.savedTo', { target: targetLabel })
            : t('tool.saveFailed', { error: result.error }),
        };
      } catch (e) {
        return { success: false, display: t('tool.exportFailed', { error: (e as Error).message }) };
      }
    },
  }),
};
