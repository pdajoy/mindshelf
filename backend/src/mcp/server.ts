import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { invoke as directInvoke, isExtensionConnected } from './bridge.js';
import { exportTab, checkTargets, type ExportTarget } from '../services/export.service.js';

export type BridgeInvoker = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

export function createMcpServer(options?: { invoke?: BridgeInvoker }): McpServer {
  const invoke: BridgeInvoker = options?.invoke ?? directInvoke;

  function requireBridge() {
    if (!options?.invoke && !isExtensionConnected()) {
      throw new Error('Chrome extension is not connected. Open the MindShelf side panel to establish the bridge.');
    }
  }
  const server = new McpServer({
    name: 'mindshelf',
    version: '2.1.0',
  });

  server.tool(
    'list_tabs',
    'List all browser tabs with title, URL, domain, topic, and AI summary',
    {},
    async () => {
      requireBridge();
      const result = await invoke('list_tabs');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'search_tabs',
    'Search browser tabs by keywords (space/comma separated), domain, or topic',
    { query: z.string().optional().describe('Keywords to match against title, domain, summary, tags'), domain: z.string().optional(), topic: z.string().optional() },
    async (args) => {
      requireBridge();
      const result = await invoke('search_tabs', args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_tab_detail',
    'Get full details for a specific tab by ID',
    { tabId: z.string().describe('Tab record ID') },
    async (args) => {
      requireBridge();
      const result = await invoke('get_tab_detail', args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'close_tabs',
    'Close browser tabs by their record IDs',
    { tabIds: z.array(z.string()).describe('Array of tab record IDs to close') },
    async (args) => {
      requireBridge();
      const result = await invoke('close_tabs', args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'categorize_tabs',
    'Trigger AI classification on tabs. Runs in the browser extension using the configured AI provider.',
    { tabIds: z.array(z.string()).optional().describe('Specific tab IDs to classify, or omit for all') },
    async (args) => {
      requireBridge();
      const result = await invoke('categorize_tabs', args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'detect_duplicates',
    'Detect duplicate tabs based on URL matching and title similarity',
    {},
    async () => {
      requireBridge();
      const result = await invoke('detect_duplicates');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_page_content',
    'Extract the text content of the currently active browser tab',
    {},
    async () => {
      requireBridge();
      const result = await invoke('get_page_content');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'summarize_tab',
    'Generate an AI summary for a specific tab. Runs in the browser extension.',
    { tabId: z.string().describe('Tab record ID to summarize') },
    async (args) => {
      requireBridge();
      const result = await invoke('summarize_tab', args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'export_to_notes',
    'Export a tab to Apple Notes. Requires macOS with Notes.app.',
    { tabId: z.string().describe('Tab record ID'), folder: z.string().optional().describe('Target folder path, e.g. "MindShelf/Tech"') },
    async (args) => {
      requireBridge();
      const tabData = (await invoke('get_tab_export_data', { tabId: args.tabId })) as any;
      if (!tabData) return { content: [{ type: 'text', text: 'Tab not found' }] };
      const result = await exportTab({
        title: tabData.title,
        url: tabData.url,
        domain: tabData.domain,
        topic: tabData.topic,
        tags: tabData.tags,
        content: tabData.content || 'No content',
        target: 'apple_notes' as ExportTarget,
        folder: args.folder,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'export_to_obsidian',
    'Export a tab to Obsidian vault as a Markdown file. Requires OBSIDIAN_VAULT_PATH configured.',
    { tabId: z.string().describe('Tab record ID'), folder: z.string().optional().describe('Subfolder in vault, e.g. "MindShelf/Tech"') },
    async (args) => {
      requireBridge();
      const tabData = (await invoke('get_tab_export_data', { tabId: args.tabId })) as any;
      if (!tabData) return { content: [{ type: 'text', text: 'Tab not found' }] };
      const result = await exportTab({
        title: tabData.title,
        url: tabData.url,
        domain: tabData.domain,
        topic: tabData.topic,
        tags: tabData.tags,
        content: tabData.content || 'No content',
        target: 'obsidian' as ExportTarget,
        folder: args.folder,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.resource('export_targets', 'export://targets', async () => {
    const targets = await checkTargets();
    return { contents: [{ uri: 'export://targets', text: JSON.stringify(targets, null, 2), mimeType: 'application/json' }] };
  });

  return server;
}
