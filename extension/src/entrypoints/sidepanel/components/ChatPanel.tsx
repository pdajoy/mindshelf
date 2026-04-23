import { useState, useRef, useEffect } from 'react';
import { useChatStore, type ChatMessage } from '../stores/chat-store';
import { useNavStore } from '../stores/nav-store';
import { useTabStore } from '../stores/tab-store';
import { MarkdownPreview } from './MarkdownPreview';
import { NoteDialog } from './NoteDialog';
import type { TabRecord } from '@/lib/types';
import { Plus, Trash2, Send, Loader2, MessageSquare, User, Bot, FileEdit, ExternalLink, ChevronDown, ChevronUp, Wrench, Zap, Command, Globe, Square } from 'lucide-react';
import { useSettingsStore } from '../stores/settings-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

function CollapsibleUserMessage({ content }: { content: string }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 200;
  if (!isLong) return <p className="text-xs whitespace-pre-wrap">{content}</p>;
  return (
    <div className="text-xs">
      <p className="whitespace-pre-wrap">{expanded ? content : content.substring(0, 150) + '...'}</p>
      <button onClick={() => setExpanded(!expanded)} className="mt-1 flex items-center gap-0.5 text-[10px] opacity-70 hover:opacity-100">
        {expanded ? <><ChevronUp className="h-2.5 w-2.5" /> {t('chat.collapseMore')}</> : <><ChevronDown className="h-2.5 w-2.5" /> {t('chat.expandAll', { count: content.length })}</>}
      </button>
    </div>
  );
}

function CollapsibleThinking({ content }: { content: string }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const thinkBlocks: string[] = [];
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    if (m[1].trim()) thinkBlocks.push(m[1].trim());
  }
  if (!thinkBlocks.length) return <MarkdownPreview content={content} />;
  const allThinking = thinkBlocks.join('\n\n---\n\n');
  const rest = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground mb-1">
        {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        {t('chat.thinkingProcess')}{thinkBlocks.length > 1 ? ` (${thinkBlocks.length})` : ''}
      </button>
      {expanded && <div className="mb-2 pl-2 border-l-2 border-muted text-[11px] text-muted-foreground/70"><MarkdownPreview content={allThinking} /></div>}
      {rest && <MarkdownPreview content={rest} />}
    </div>
  );
}

function ToolCallCard({ name, display, status, collapsed, onToggle }: { name: string; display?: string; status: 'calling' | 'done'; collapsed?: boolean; onToggle?: () => void }) {
  const { t } = useT();
  const toolLabels: Record<string, string> = {
    search_tabs: t('tool.searchTabs'),
    list_tabs_summary: t('tool.tabsSummary'),
    save_note: t('tool.saveNote'),
    close_tabs: t('tool.closeTabs'),
    classify_tab: t('tool.classifyTab'),
    get_tab_detail: t('tool.tabDetail'),
    get_page_content: t('tool.pageContent'),
    detect_duplicates: t('tool.detectDups'),
  };
  return (
    <div className="rounded-md bg-muted/30 border border-border/30 text-[10px] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-2 py-1 hover:bg-muted/50 transition-colors">
        {status === 'calling' ? <Loader2 className="h-2.5 w-2.5 animate-spin text-primary shrink-0" /> : <Wrench className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
        <span className="font-medium text-muted-foreground shrink-0">{toolLabels[name] || name}</span>
        {status === 'done' && collapsed && <span className="text-muted-foreground/60 truncate flex-1 text-left">{display || 'done'}</span>}
        {collapsed !== undefined && (collapsed ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" /> : <ChevronUp className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />)}
      </button>
      {!collapsed && display && (
        <div className="px-2 py-1 border-t border-border/30 text-muted-foreground/70 whitespace-pre-wrap">{display}</div>
      )}
    </div>
  );
}

function ModelSelector() {
  const { providers, activeProviderId, activeModel, setActiveProvider, setActiveModel } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const activeProvider = providers.find(p => p.id === activeProviderId);
  const { t } = useT();
  if (!providers.length) return <span className="text-[10px] text-muted-foreground/50">{t('chat.noModel')}</span>;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:bg-muted border border-transparent hover:border-border transition-colors max-w-[160px]">
        <span className="truncate">{activeModel || t('chat.selectModel')}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-40 min-w-[180px] max-w-[260px] bg-background border border-border rounded-lg shadow-lg py-1 max-h-60 overflow-auto">
            {providers.map(p => (
              <div key={p.id}>
                <div className="px-2 py-1 text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wide">{p.name}</div>
                {p.models.map(m => (
                  <button key={m} onClick={() => { setActiveProvider(p.id, m); setOpen(false); }}
                    className={cn('w-full text-left px-3 py-1 text-[11px] hover:bg-muted/50 transition-colors flex items-center gap-1.5',
                      p.id === activeProviderId && m === activeModel && 'text-primary bg-primary/5')}>
                    {p.id === activeProviderId && m === activeModel && <span className="h-1 w-1 rounded-full bg-primary shrink-0" />}
                    <span className="truncate">{m}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ChatPanel() {
  const { t } = useT();
  const {
    sessions, activeSessionId, isStreaming, agentMode, pageContext,
    createSession, selectSession, deleteSession, sendMessage, stopStreaming, setAgentMode, setPageContext,
  } = useChatStore();
  const { pendingSummarizeTabId, clearPendingSummarize } = useNavStore();
  const tabs = useTabStore(s => s.tabs);

  const [input, setInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [noteTab, setNoteTab] = useState<TabRecord | null>(null);
  const [contextTabId, setContextTabId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quickPrompts = useSettingsStore(s => s.quickPrompts);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const contextTab = contextTabId ? tabs.find(t => t.id === contextTabId) : null;

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
  };

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages.length, activeSession?.messages[activeSession.messages.length - 1]?.content]);

  useEffect(() => {
    if (pendingSummarizeTabId && !isStreaming) {
      const tab = tabs.find(t => t.id === pendingSummarizeTabId);
      clearPendingSummarize();
      if (tab) {
        setContextTabId(tab.id);
        handleSummarizeTab(tab);
      }
    }
  }, [pendingSummarizeTabId]);

  useEffect(() => {
    detectActivePage();
  }, []);

  const handleSummarizeTab = async (tab: typeof tabs[0]) => {
    if (!useSettingsStore.getState().isAIConfigured()) {
      createSession();
      setTimeout(() => sendMessage(t('chat.configureFirst')), 100);
      return;
    }

    if (isStreaming) stopStreaming();

    let contentText = tab.content_text || '';
    if (!contentText && tab.source_tab_id) {
      const extractClean = async (html: string) => {
        const { extractFromHTML } = await import('@/lib/content-extractor');
        const extracted = extractFromHTML(html, tab.url, 'defuddle');
        return extracted.plainText || extracted.markdown || '';
      };
      try {
        const csResult = await chrome.tabs.sendMessage(tab.source_tab_id, { type: 'EXTRACT_CONTENT_CS' });
        if (csResult?.html) contentText = await extractClean(csResult.html);
      } catch {}
      if (!contentText) {
        try {
          const htmlResult = await chrome.runtime.sendMessage({ type: 'EXTRACT_HTML', tabId: tab.source_tab_id });
          if (htmlResult?.html) contentText = await extractClean(htmlResult.html);
        } catch {}
      }
    }

    const sessionId = createSession();
    useChatStore.setState(state => ({
      sessions: state.sessions.map(s =>
        s.id === sessionId ? { ...s, title: `${t('chat.summaryPrefix')}: ${tab.title.substring(0, 20)}` } : s
      ),
    }));

    setPageContext({
      title: tab.title,
      url: tab.url,
      domain: tab.domain,
      favicon: tab.favicon_url,
      contentExcerpt: contentText.substring(0, 6000),
    });

    await sendMessage(t('chat.summarizePrompt'));
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const msg = input;
    setInput('');
    await sendMessage(msg);
  };

  const detectActivePage = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        const domain = new URL(tab.url).hostname.replace('www.', '');
        const ctx = { title: tab.title || '', url: tab.url, domain, favicon: tab.favIconUrl };
        setPageContext(ctx);

        if (tab.id) {
          extractPageContentForContext(tab.id, tab.url, ctx);
        }
      } else {
        setPageContext(null);
      }
    } catch {
      setPageContext(null);
    }
  };

  const extractPageContentForContext = async (
    tabId: number,
    url: string,
    ctx: Parameters<typeof setPageContext>[0] & {},
  ) => {
    const guard = () => {
      const cur = useChatStore.getState().pageContext;
      return cur?.url === ctx.url;
    };

    const applyExtracted = async (html: string) => {
      const { extractFromHTML } = await import('@/lib/content-extractor');
      const extracted = extractFromHTML(html, url, 'defuddle');
      const text = extracted.plainText || extracted.markdown || '';
      if (text && guard()) {
        setPageContext({ ...ctx, contentExcerpt: text.substring(0, 3000) });
        return true;
      }
      return false;
    };

    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT_CS' });
      if (result?.html && guard()) {
        if (await applyExtracted(result.html)) return;
      }
    } catch { /* content script not ready */ }

    if (!guard()) return;

    try {
      const htmlResult = await chrome.runtime.sendMessage({ type: 'EXTRACT_HTML', tabId });
      if (htmlResult?.html && guard()) {
        await applyExtracted(htmlResult.html);
      }
    } catch { /* extraction failed, metadata-only fallback */ }
  };

  const handleNewChat = () => {
    if (isStreaming) stopStreaming();
    createSession();
    setContextTabId(null);
    setShowSidebar(false);
    detectActivePage();
    inputRef.current?.focus();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString('zh-CN', { weekday: 'short' });
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const toggleToolCollapse = (idx: number) => {
    useChatStore.setState(state => ({
      sessions: state.sessions.map(s => {
        if (s.id !== activeSessionId) return s;
        return { ...s, messages: s.messages.map((m, i) => i === idx ? { ...m, collapsed: !m.collapsed } : m) };
      }),
    }));
  };

  interface MsgGroup {
    type: 'user' | 'agent';
    messages: Array<{ msg: ChatMessage; idx: number }>;
  }
  const groupedMessages = (() => {
    if (!activeSession) return [] as MsgGroup[];
    const groups: MsgGroup[] = [];
    let current: MsgGroup | null = null;
    for (let i = 0; i < activeSession.messages.length; i++) {
      const msg = activeSession.messages[i];
      if (msg.role === 'user') {
        if (current) groups.push(current);
        groups.push({ type: 'user', messages: [{ msg, idx: i }] });
        current = null;
      } else {
        if (!current) current = { type: 'agent', messages: [] };
        current.messages.push({ msg, idx: i });
      }
    }
    if (current) groups.push(current);
    return groups;
  })();

  const renderUserGroup = (group: MsgGroup, key: number) => {
    const { msg } = group.messages[0];
    return (
      <div key={key} className="flex gap-2 flex-row-reverse">
        <div className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center bg-primary text-primary-foreground">
          <User className="h-3 w-3" />
        </div>
        <div className="max-w-[85%] rounded-lg px-2.5 py-1.5 bg-primary text-primary-foreground text-xs">
          <CollapsibleUserMessage content={msg.content} />
        </div>
      </div>
    );
  };

  const renderAgentGroup = (group: MsgGroup, key: number) => {
    const toolEntries = group.messages.filter(e => e.msg.role === 'tool_call' || e.msg.role === 'tool_result');
    const textEntries = group.messages.filter(e => e.msg.role === 'assistant' && e.msg.content.trim());
    const hasEmptyAssistant = group.messages.some(e => e.msg.role === 'assistant' && !e.msg.content.trim());
    const isLastGroup = key === groupedMessages.length - 1;
    const showThinking = isStreaming && isLastGroup && hasEmptyAssistant && !textEntries.length;

    if (!showThinking && !toolEntries.length && !textEntries.length) return null;

    return (
      <div key={key} className="flex gap-2">
        <div className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
          <Bot className="h-3 w-3" />
        </div>
        <div className="max-w-[85%] space-y-1.5 min-w-0">
          {showThinking && (
            <div className="rounded-lg px-2.5 py-1.5 bg-muted/50 border border-border/50">
              <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> {t('chat.thinking')}
              </div>
            </div>
          )}
          {toolEntries.length > 0 && (
            <div className="space-y-0.5">
              {toolEntries.map(({ msg, idx }) => {
                if (msg.role === 'tool_call') {
                  const hasResult = group.messages.some(
                    e => e.msg.role === 'tool_result' && e.msg.toolCallId === msg.toolCallId,
                  );
                  if (hasResult) return null;
                }
                return (
                  <ToolCallCard
                    key={idx}
                    name={msg.toolName || ''}
                    display={msg.role === 'tool_result' ? msg.content : undefined}
                    status={msg.role === 'tool_call' ? 'calling' : 'done'}
                    collapsed={msg.collapsed}
                    onToggle={() => toggleToolCollapse(idx)}
                  />
                );
              })}
            </div>
          )}
          {textEntries.map(({ msg, idx }) => {
            const isLastText = idx === textEntries[textEntries.length - 1].idx;
            const showCursor = isStreaming && isLastGroup && isLastText;
            return (
              <div key={idx} className="rounded-lg px-2.5 py-1.5 bg-muted/50 border border-border/50">
                <CollapsibleThinking content={showCursor ? `${msg.content}▍` : msg.content} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const aiConfigured = useSettingsStore(s => s.isAIConfigured());

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Session Sidebar */}
      {showSidebar && (
        <div className="absolute inset-0 z-20 flex">
          <div className="w-64 bg-background border-r border-border flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold">{t('chat.chatHistory')}</span>
              <button onClick={handleNewChat} className="p-1 rounded hover:bg-muted" title={t('chat.newChat')}><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex-1 overflow-auto">
              {sessions.length === 0 && <div className="p-4 text-xs text-muted-foreground text-center">{t('chat.noChats')}</div>}
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => { selectSession(s.id); setShowSidebar(false); }}
                  className={cn('group flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted/50', s.id === activeSessionId && 'bg-primary/5 text-primary')}
                >
                  <MessageSquare className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{s.title}</div>
                    <div className="text-[10px] text-muted-foreground">{formatTime(s.updatedAt)}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-foreground/10" onClick={() => setShowSidebar(false)} />
        </div>
      )}

      {/* Chat Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
        <button onClick={() => setShowSidebar(!showSidebar)} className="p-1 rounded hover:bg-muted text-muted-foreground" title={t('chat.chatHistory')}>
          <MessageSquare className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium truncate flex-1">{activeSession?.title || t('chat.newChat')}</span>
        {pageContext && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50 text-[9px] text-muted-foreground max-w-[120px]" title={`当前页面上下文已注入: ${pageContext.title}`}>
            <Globe className="h-2.5 w-2.5 shrink-0 text-primary/60" />
            <span className="truncate">{pageContext.domain}</span>
            <button onClick={() => setPageContext(null)} className="shrink-0 hover:text-foreground">&times;</button>
          </div>
        )}
        <button onClick={handleNewChat} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-primary/10 text-primary hover:bg-primary/20">
          <Plus className="h-3 w-3" /> {t('chat.newChat')}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-auto px-3 py-2 space-y-3">
        {(!activeSession || activeSession.messages.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <Bot className="h-8 w-8 text-muted-foreground/30 mb-2" />
            {!aiConfigured ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {t('chat.configureProvider')}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/50 mt-1">
                {agentMode
                  ? t('chat.agentHint')
                  : t('chat.chatHint')}
              </p>
            )}
            {pageContext && (
              <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10 text-left max-w-[90%]">
                <Globe className="h-3 w-3 shrink-0 text-primary/50" />
                {pageContext.favicon && <img src={pageContext.favicon} className="h-3.5 w-3.5 rounded-sm shrink-0" alt="" />}
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground truncate">{pageContext.title}</div>
                  <div className="text-[9px] text-muted-foreground/50 truncate">{pageContext.domain}</div>
                </div>
                <span className="text-[9px] text-primary/60 shrink-0 ml-1">{t('chat.contextInjected')}</span>
                <button onClick={() => setPageContext(null)} className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground text-[10px] ml-1">&times;</button>
              </div>
            )}
            <div className="mt-4 space-y-1 w-full max-w-[280px]">
              {[
                { icon: '📝', text: t('chat.quickSummarize') },
                { icon: '🏷️', text: t('chat.quickCategories') },
                { icon: '🔄', text: t('chat.quickDuplicates') },
                { icon: '💡', text: t('chat.quickRecommend') },
              ].map(q => (
                <button key={q.text} onClick={() => setInput(q.text)} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left rounded-lg border border-border/60 hover:bg-muted/50 hover:border-primary/30 transition-colors">
                  <span>{q.icon}</span>
                  <span className="text-muted-foreground">{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {groupedMessages.map((group, gi) =>
          group.type === 'user' ? renderUserGroup(group, gi) : renderAgentGroup(group, gi)
        )}

        {contextTab && !isStreaming && activeSession && activeSession.messages.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
            <img src={contextTab.favicon_url || `https://www.google.com/s2/favicons?domain=${contextTab.domain}&sz=16`} className="h-3.5 w-3.5 rounded-sm shrink-0" alt="" />
            <span className="text-[10px] text-muted-foreground truncate flex-1">{contextTab.title}</span>
            <button onClick={() => setNoteTab(contextTab)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20">
              <FileEdit className="h-2.5 w-2.5" /> {t('chat.saveNote')}
            </button>
            {contextTab.source_tab_id && (
              <button onClick={() => chrome.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: contextTab.source_tab_id, windowId: contextTab.source_window_id })} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:bg-muted">
                <ExternalLink className="h-2.5 w-2.5" /> {t('chat.jump')}
              </button>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border shrink-0 space-y-1.5">
        {showQuickPrompts && quickPrompts.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {quickPrompts.map(p => (
              <button key={p.name} onClick={() => { setInput(prev => prev ? `${prev}\n${p.prompt}` : p.prompt); setShowQuickPrompts(false); inputRef.current?.focus(); }} className="px-2 py-0.5 text-[10px] rounded-full bg-muted border border-border hover:border-primary/50 transition-colors truncate max-w-[140px]">
                <Zap className="h-2 w-2 inline mr-0.5" />{p.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1 items-center text-[10px]">
          <button
            onClick={() => setAgentMode(!agentMode)}
            className={cn(
              'flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors shrink-0',
              agentMode
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'text-muted-foreground hover:bg-muted border border-transparent',
            )}
            title={agentMode ? 'Agent 模式 ON' : 'Agent 模式 OFF'}
          >
            <Zap className="h-2.5 w-2.5" />Agent
          </button>
          <ModelSelector />
          {quickPrompts.length > 0 && (
            <button onClick={() => setShowQuickPrompts(!showQuickPrompts)} className={cn('shrink-0 px-1.5 py-0.5 rounded transition-colors', showQuickPrompts ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} title="快捷指令">
              <Command className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isStreaming) { e.preventDefault(); handleSend(); } }}
            placeholder={aiConfigured ? t('chat.inputPlaceholder') : t('chat.configPlaceholder')}
            disabled={!aiConfigured}
            rows={input.split('\n').length > 3 ? 4 : input.includes('\n') ? 2 : 1}
            className="flex-1 min-h-[32px] max-h-24 px-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
          />
          {isStreaming ? (
            <button onClick={stopStreaming} className="shrink-0 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs flex items-center gap-1 hover:bg-primary/90" title="停止生成">
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim() || !aiConfigured} className="shrink-0 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs disabled:opacity-50 flex items-center gap-1">
              <Send className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {noteTab && <NoteDialog tab={noteTab} onClose={() => setNoteTab(null)} />}
    </div>
  );
}
