import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import '../config.js';
import { queries, runTransaction } from '../db.js';
import { categorizeTabs, applyCategorizations } from '../services/categorizer.js';
import { summarizeTab, summarizeGroup } from '../services/summarizer.js';
import { analyzeTabs } from '../services/analyzer.js';

const server = new McpServer({
  name: 'chrome-tab-helper',
  version: '0.1.0',
});

server.tool('list_tabs', 'List all tracked browser tabs, optionally filtered by status or category', {
  status: z.enum(['active', 'snoozed', 'archived', 'closed', 'all']).optional().describe('Filter by status'),
  category: z.string().optional().describe('Filter by category ID'),
}, async ({ status, category }) => {
  let tabs;
  if (category) {
    tabs = queries.getTabsByCategory.all(category);
  } else if (status && status !== 'all') {
    tabs = queries.getTabsByStatus.all(status);
  } else {
    tabs = queries.getAllTabs.all();
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ total: tabs.length, tabs }, null, 2),
    }],
  };
});

server.tool('get_tab', 'Get detailed info about a specific tab', {
  id: z.string().describe('Tab ID'),
}, async ({ id }) => {
  const tab = queries.getTab.get(id);
  if (!tab) return { content: [{ type: 'text', text: 'Tab not found' }] };
  return { content: [{ type: 'text', text: JSON.stringify(tab, null, 2) }] };
});

server.tool('list_categories', 'List all categories with tab counts', {}, async () => {
  const categories = queries.getCategories.all();
  return { content: [{ type: 'text', text: JSON.stringify(categories, null, 2) }] };
});

server.tool('categorize_tabs', 'Use AI to automatically categorize all active tabs', {}, async () => {
  const tabs = queries.getActiveTabs.all();
  if (tabs.length === 0) return { content: [{ type: 'text', text: 'No active tabs to categorize' }] };

  const categorizations = await categorizeTabs(tabs);
  applyCategorizations(categorizations);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ categorized: Object.keys(categorizations).length, categorizations }, null, 2),
    }],
  };
});

server.tool('summarize_tab', 'Generate AI summary for a specific tab', {
  id: z.string().describe('Tab ID'),
}, async ({ id }) => {
  const tab = queries.getTab.get(id);
  if (!tab) return { content: [{ type: 'text', text: 'Tab not found' }] };

  const result = await summarizeTab(tab);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('summarize_category', 'Generate AI summary for all tabs in a category', {
  category_id: z.string().describe('Category ID'),
}, async ({ category_id }) => {
  const result = await summarizeGroup(category_id);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('close_tabs', 'Mark tabs as closed', {
  tab_ids: z.array(z.string()).describe('Array of tab IDs to close'),
  context: z.string().optional().describe('Reason for closing'),
}, async ({ tab_ids, context }) => {
  runTransaction(() => {
    for (const id of tab_ids) {
      queries.updateTabStatus('closed', 'closed', id);
      if (context) queries.updateTabCloseContext(context, id);
    }
  });
  return { content: [{ type: 'text', text: `Closed ${tab_ids.length} tabs` }] };
});

server.tool('update_tab_category', 'Move a tab to a different category', {
  tab_id: z.string().describe('Tab ID'),
  category_id: z.string().describe('Target category ID'),
}, async ({ tab_id, category_id }) => {
  queries.updateTabCategory(category_id, tab_id);
  return { content: [{ type: 'text', text: `Tab ${tab_id} moved to ${category_id}` }] };
});

server.tool('search_tabs', 'Search tabs by keyword in title, URL, or summary', {
  query: z.string().describe('Search keyword'),
}, async ({ query }) => {
  const q = `%${query}%`;
  const tabs = queries.searchTabs.all(q, q, q);
  return { content: [{ type: 'text', text: JSON.stringify({ total: tabs.length, tabs }, null, 2) }] };
});

server.tool('get_stats', 'Get tab management statistics', {}, async () => {
  const stats = queries.getStats.get();
  const categories = queries.getCategories.all();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ ...stats, categories_detail: categories }, null, 2),
    }],
  };
});

server.tool('export_markdown', 'Export all tabs as a Markdown report', {}, async () => {
  const tabs = queries.getActiveTabs.all();
  const categories = queries.getCategories.all();
  const catMap = {};
  for (const cat of categories) catMap[cat.id] = cat;

  const grouped = {};
  for (const tab of tabs) {
    const catId = tab.topic_id || tab.category_id || 'uncategorized';
    if (!grouped[catId]) grouped[catId] = [];
    grouped[catId].push(tab);
  }

  let md = `# Browser Tabs Report\n\nTotal: ${tabs.length} tabs\n\n`;
  for (const [catId, catTabs] of Object.entries(grouped)) {
    const cat = catMap[catId] || { icon: '📌', name: catId };
    md += `## ${cat.icon} ${cat.name} (${catTabs.length})\n\n`;
    for (const tab of catTabs) {
      md += `- [${tab.title || 'Untitled'}](${tab.url})`;
      if (tab.summary) md += ` — ${tab.summary}`;
      md += '\n';
    }
    md += '\n';
  }

  return { content: [{ type: 'text', text: md }] };
});

server.tool('analyze_tabs', 'Deep analysis of all tabs — domains, topics, keywords, duplicates, persona profiling', {}, async () => {
  const tabs = queries.getActiveTabs.all();
  const result = analyzeTabs(tabs);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Chrome Tab Helper MCP server running on stdio');
}

main().catch(console.error);
