import { create } from 'zustand';
import { streamChatMessage, type PageContext, type ChatStreamEvent } from '@/lib/ai-chat';
import { useSettingsStore } from './settings-store';
import i18next from 'i18next';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  collapsed?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isStreaming: boolean;
  agentMode: boolean;
  pageContext: PageContext | null;

  createSession: () => string;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  getActiveSession: () => ChatSession | null;
  setAgentMode: (on: boolean) => void;
  setPageContext: (ctx: PageContext | null) => void;
}

const CHAT_STORAGE_KEY = 'mindshelf_chat_sessions';
const AGENT_MODE_KEY = 'mindshelf_agent_mode';

function formatAIError(err: unknown): string {
  if (!(err instanceof Error)) return `Error: ${String(err)}`;
  const e = err as Error & {
    statusCode?: number;
    url?: string;
    responseBody?: string;
    cause?: unknown;
  };
  const parts = [`**Error:** ${e.message}`];
  if (e.statusCode) parts.push(`Status: ${e.statusCode}`);
  if (e.url) parts.push(`URL: ${e.url}`);
  if (e.responseBody) {
    const body = e.responseBody.length > 500
      ? e.responseBody.substring(0, 500) + '...'
      : e.responseBody;
    parts.push(`Response: ${body}`);
  }
  if (e.cause instanceof Error) {
    parts.push(`Cause: ${e.cause.message}`);
  }
  return parts.join('\n');
}

let activeAbortController: AbortController | null = null;

function saveSessions(sessions: ChatSession[]) {
  try {
    const toSave = sessions.slice(0, 50).map(s => ({
      ...s,
      messages: s.messages.filter(m => m.role !== 'tool_call'),
    }));
    chrome.storage.local.set({ [CHAT_STORAGE_KEY]: toSave });
  } catch {}
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isStreaming: false,
  agentMode: false,
  pageContext: null,

  createSession: () => {
    const id = crypto.randomUUID();
    const session: ChatSession = { id, title: i18next.t('chat.newChat'), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    const sessions = [session, ...get().sessions];
    set({ sessions, activeSessionId: id });
    saveSessions(sessions);
    return id;
  },

  selectSession: (id) => set({ activeSessionId: id }),

  deleteSession: (id) => {
    const sessions = get().sessions.filter(s => s.id !== id);
    const activeId = get().activeSessionId === id ? (sessions[0]?.id || null) : get().activeSessionId;
    set({ sessions, activeSessionId: activeId });
    saveSessions(sessions);
  },

  setAgentMode: (on) => {
    set({ agentMode: on });
    chrome.storage.local.set({ [AGENT_MODE_KEY]: on }).catch(() => {});
  },

  setPageContext: (ctx) => set({ pageContext: ctx }),

  stopStreaming: () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
  },

  sendMessage: async (content) => {
    let sessionId = get().activeSessionId;
    if (!sessionId) sessionId = get().createSession();

    const userMsg: ChatMessage = { role: 'user', content, timestamp: Date.now() };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() };

    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === sessionId ? {
          ...s,
          messages: [...s.messages, userMsg, assistantMsg],
          title: s.messages.length === 0 ? content.substring(0, 30) : s.title,
          updatedAt: Date.now(),
        } : s
      ),
      isStreaming: true,
    }));

    try {
      const settings = useSettingsStore.getState();
      if (!settings.isAIConfigured()) {
        appendToAssistant(sessionId!, i18next.t('chat.configureAIModel'));
        return;
      }

      const config = settings.getAIConfig();
      const session = get().sessions.find(s => s.id === sessionId);
      const history = session?.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(0, -1)
        .map(m => ({ role: m.role, content: m.content })) || [];

      const pageContext = get().pageContext;
      const agentMode = get().agentMode;
      const maxSteps = settings.maxAgentSteps;

      activeAbortController = new AbortController();
      for await (const event of streamChatMessage(history, config, { pageContext, agentMode, abortSignal: activeAbortController.signal, maxSteps })) {
        handleStreamEvent(sessionId!, event);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User stopped generation — don't show as error
      } else {
        const errText = formatAIError(err);
        appendToAssistant(sessionId!, errText);
      }
    } finally {
      activeAbortController = null;
      set(state => ({
        isStreaming: false,
        sessions: state.sessions.map(s => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: s.messages.filter(m => !(m.role === 'assistant' && !m.content.trim())),
          };
        }),
      }));
      saveSessions(get().sessions);
    }
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find(s => s.id === activeSessionId) || null;
  },
}));

function handleStreamEvent(sessionId: string, event: ChatStreamEvent) {
  switch (event.type) {
    case 'text-delta':
      if (event.text) appendToAssistant(sessionId, event.text);
      break;

    case 'error':
      appendToAssistant(sessionId, formatAIError(event.error));
      break;

    case 'tool-call':
      useChatStore.setState(state => ({
        sessions: state.sessions.map(s => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: [...s.messages, {
              role: 'tool_call' as const,
              content: event.args || '',
              toolName: event.toolName,
              toolCallId: event.toolCallId,
              timestamp: Date.now(),
              collapsed: false,
            }],
          };
        }),
      }));
      break;

    case 'tool-result':
      useChatStore.setState(state => ({
        sessions: state.sessions.map(s => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: [...s.messages, {
              role: 'tool_result' as const,
              content: event.display || '',
              toolName: event.toolName,
              toolCallId: event.toolCallId,
              timestamp: Date.now(),
              collapsed: true,
            }],
          };
        }),
      }));
      break;

    case 'finish':
      break;
  }
}

function appendToAssistant(sessionId: string, text: string) {
  useChatStore.setState(state => ({
    sessions: state.sessions.map(s => {
      if (s.id !== sessionId) return s;
      const msgs = s.messages;
      let lastAssistantIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') { lastAssistantIdx = i; break; }
      }
      if (lastAssistantIdx >= 0) {
        return {
          ...s,
          messages: msgs.map((m, i) =>
            i === lastAssistantIdx ? { ...m, content: m.content + text } : m
          ),
        };
      }
      return {
        ...s,
        messages: [...msgs, { role: 'assistant' as const, content: text, timestamp: Date.now() }],
      };
    }),
  }));
}

if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  Promise.all([
    chrome.storage.local.get(CHAT_STORAGE_KEY),
    chrome.storage.local.get(AGENT_MODE_KEY),
  ]).then(([chatResult, agentResult]) => {
    const sessions = chatResult[CHAT_STORAGE_KEY];
    const agentMode = agentResult[AGENT_MODE_KEY];
    const updates: Partial<ChatState> = {};
    if (Array.isArray(sessions) && sessions.length) {
      updates.sessions = sessions;
      updates.activeSessionId = sessions[0]?.id || null;
    }
    if (typeof agentMode === 'boolean') {
      updates.agentMode = agentMode;
    }
    if (Object.keys(updates).length) {
      useChatStore.setState(updates);
    }
  }).catch(() => {});
}
