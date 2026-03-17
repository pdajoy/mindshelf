import { useState, useRef, useEffect } from 'react';
import { useChatStore, type ChatMessage } from '../stores/chat-store';
import { useNavStore } from '../stores/nav-store';
import { useTabStore } from '../stores/tab-store';
import { MarkdownPreview } from './MarkdownPreview';
import { NoteDialog } from './NoteDialog';
import type { TabRecord } from '@/lib/types';
import { Plus, Trash2, Send, Loader2, MessageSquare, User, Bot, FileEdit, ExternalLink, ChevronDown, ChevronUp, Wrench, Zap, Command } from 'lucide-react';
import { useSettingsStore } from '../stores/settings-store';
import { cn } from '@/lib/utils';

function CollapsibleUserMessage({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 200;
  if (!isLong) return <p className="text-xs whitespace-pre-wrap">{content}</p>;
  return (
    <div className="text-xs">
      <p className="whitespace-pre-wrap">{expanded ? content : content.substring(0, 150) + '...'}</p>
      <button onClick={() => setExpanded(!expanded)} className="mt-1 flex items-center gap-0.5 text-[10px] opacity-70 hover:opacity-100">
        {expanded ? <><ChevronUp className="h-2.5 w-2.5" /> 收起</> : <><ChevronDown className="h-2.5 w-2.5" /> 展开全部 ({content.length}字)</>}
      </button>
    </div>
  );
}

function CollapsibleThinking({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (!thinkMatch) return <MarkdownPreview content={content} />;
  const thinking = thinkMatch[1].trim();
  const rest = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground mb-1">
        {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />} 💭 思考过程
      </button>
      {expanded && <div className="mb-2 pl-2 border-l-2 border-muted text-[11px] text-muted-foreground/70"><MarkdownPreview content={thinking} /></div>}
      {rest && <MarkdownPreview content={rest} />}
    </div>
  );
}

function ToolCallCard({ name, display, status, collapsed, onToggle }: { name: string; display?: string; status: 'calling' | 'done'; collapsed?: boolean; onToggle?: () => void }) {
  const toolLabels: Record<string, string> = {
    search_tabs: '🔍 搜索标签',
    list_tabs_summary: '📊 标签概况',
    save_note: '💾 保存笔记',
    close_tabs: '🗑️ 关闭标签',
    classify_tab: '🏷️ 分类标签',
    get_tab_detail: '📑 查看详情',
  };
  return (
    <div className="rounded-md bg-muted/30 border border-border/30 text-[10px] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-2 py-1 hover:bg-muted/50 transition-colors">
        {status === 'calling' ? <Loader2 className="h-2.5 w-2.5 animate-spin text-primary shrink-0" /> : <Wrench className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
        <span className="font-medium text-muted-foreground">{toolLabels[name] || name}</span>
        {status === 'done' && <span className="text-muted-foreground/60 truncate flex-1 text-left">✓</span>}
        {collapsed !== undefined && (collapsed ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" /> : <ChevronUp className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />)}
      </button>
      {!collapsed && display && (
        <div className="px-2 py-1 border-t border-border/30 text-muted-foreground/70 whitespace-pre-wrap">{display}</div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const {
    sessions, activeSessionId, isStreaming, agentMode,
    createSession, selectSession, deleteSession, sendMessage, toggleAgentMode,
  } = useChatStore();
  const { pendingSummarizeTabId, clearPendingSummarize } = useNavStore();
  const tabs = useTabStore(s => s.tabs);

  const [input, setInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [noteTab, setNoteTab] = useState<TabRecord | null>(null);
  const [contextTabId, setContextTabId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quickPrompts = useSettingsStore(s => s.quickPrompts);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const contextTab = contextTabId ? tabs.find(t => t.id === contextTabId) : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const handleSummarizeTab = async (tab: typeof tabs[0]) => {
    let contentText = tab.content_text || '';
    if (!contentText && tab.source_tab_id) {
      try {
        const htmlResult = await chrome.runtime.sendMessage({ type: 'EXTRACT_HTML', tabId: tab.source_tab_id });
        if (htmlResult?.html) {
          const { api } = await import('@/lib/api');
          const extracted = await api.content.extract({ html: htmlResult.html, url: tab.url, extractor: 'readability' });
          contentText = extracted.plainText || extracted.markdown || '';
          if (contentText) {
            await api.tabs.update(tab.id, { content_text: contentText.substring(0, 50000) } as any);
          }
        }
      } catch {
        try {
          const result = await chrome.runtime.sendMessage({ type: 'EXTRACT_CONTENT', tabId: tab.source_tab_id });
          if (result?.content_text) {
            contentText = result.content_text;
            const { api } = await import('@/lib/api');
            await api.tabs.update(tab.id, { content_text: contentText } as any);
          }
        } catch {}
      }
    }
    const prompt = `请总结这个网页：\n标题：${tab.title}\nURL：${tab.url}\n域名：${tab.domain}${contentText ? `\n\n内容：\n${contentText.substring(0, 6000)}` : '\n\n（无法获取页面正文，请根据标题和URL进行分析）'}`;
    createSession();
    setTimeout(() => sendMessage(prompt), 100);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const msg = input;
    setInput('');
    await sendMessage(msg);
  };

  const handleNewChat = () => {
    createSession();
    setShowSidebar(false);
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

  // Group consecutive non-user messages into agent response blocks
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

    // Skip entirely empty groups when not streaming
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
                <Loader2 className="h-3 w-3 animate-spin" /> 思考中...
              </div>
            </div>
          )}
          {toolEntries.length > 0 && (
            <div className="space-y-0.5">
              {toolEntries.map(({ msg, idx }) => (
                <ToolCallCard
                  key={idx}
                  name={msg.toolName || ''}
                  display={msg.role === 'tool_result' ? msg.content : undefined}
                  status={msg.role === 'tool_call' ? 'calling' : 'done'}
                  collapsed={msg.collapsed}
                  onToggle={() => toggleToolCollapse(idx)}
                />
              ))}
            </div>
          )}
          {textEntries.map(({ msg, idx }) => (
            <div key={idx} className="rounded-lg px-2.5 py-1.5 bg-muted/50 border border-border/50">
              <CollapsibleThinking content={msg.content} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Session Sidebar */}
      {showSidebar && (
        <div className="absolute inset-0 z-20 flex">
          <div className="w-64 bg-background border-r border-border flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold">对话历史</span>
              <button onClick={handleNewChat} className="p-1 rounded hover:bg-muted" title="新对话"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex-1 overflow-auto">
              {sessions.length === 0 && <div className="p-4 text-xs text-muted-foreground text-center">暂无对话</div>}
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
        <button onClick={() => setShowSidebar(!showSidebar)} className="p-1 rounded hover:bg-muted text-muted-foreground" title="对话历史">
          <MessageSquare className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium truncate flex-1">{activeSession?.title || '新对话'}</span>
        <button
          onClick={() => toggleAgentMode()}
          className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors', agentMode ? 'bg-amber-100 text-amber-700 font-medium' : 'text-muted-foreground hover:bg-muted')}
          title={agentMode ? 'Agent 模式（可执行工具）' : '普通聊天模式'}
        >
          <Zap className="h-3 w-3" />
          {agentMode ? 'Agent' : '普通'}
        </button>
        <button onClick={handleNewChat} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-primary/10 text-primary hover:bg-primary/20">
          <Plus className="h-3 w-3" /> 新对话
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
        {(!activeSession || activeSession.messages.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground/60 font-medium">MindShelf AI</p>
            <p className="text-xs text-muted-foreground/40 mt-1">
              {agentMode ? '🔧 Agent 模式：我可以直接执行标签管理操作' : '问我任何关于标签管理的问题'}
            </p>
            <div className="mt-4 space-y-1.5">
              {(agentMode
                ? ['查看我的标签统计', '把tech分类的标签保存到Apple Notes', '帮我关闭所有shopping标签']
                : ['列出所有tech分类的标签', '帮我整理重复的标签', '总结一下我打开的标签']
              ).map(q => (
                <button key={q} onClick={() => setInput(q)} className="block w-full px-3 py-1.5 text-xs text-left rounded-lg border border-border hover:bg-muted/50 transition-colors">
                  {q}
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
              <FileEdit className="h-2.5 w-2.5" /> 保存笔记
            </button>
            {contextTab.source_tab_id && (
              <button onClick={() => chrome.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: contextTab.source_tab_id, windowId: contextTab.source_window_id })} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:bg-muted">
                <ExternalLink className="h-2.5 w-2.5" /> 跳转
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
        <div className="flex gap-1.5 items-end">
          {quickPrompts.length > 0 && (
            <button onClick={() => setShowQuickPrompts(!showQuickPrompts)} className={cn('shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors', showQuickPrompts ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} title="快捷指令">
              <Command className="h-3.5 w-3.5" />
            </button>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={agentMode ? '让 Agent 帮你操作... (Shift+Enter 换行)' : '输入消息... (Shift+Enter 换行)'}
            disabled={isStreaming}
            rows={input.split('\n').length > 3 ? 4 : input.includes('\n') ? 2 : 1}
            className="flex-1 min-h-[32px] max-h-24 px-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs disabled:opacity-50 flex items-center gap-1"
          >
            {isStreaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {noteTab && <NoteDialog tab={noteTab} onClose={() => setNoteTab(null)} />}
    </div>
  );
}
