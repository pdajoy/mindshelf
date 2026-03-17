import { create } from 'zustand';
import { fetchSSE } from '@/lib/api';
import { useSettingsStore } from './settings-store';

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

  createSession: () => string;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  getActiveSession: () => ChatSession | null;
  toggleAgentMode: () => void;
}

const CHAT_STORAGE_KEY = 'mindshelf_chat_sessions';

function saveSessions(sessions: ChatSession[]) {
  try {
    const toSave = sessions.slice(0, 50).map(s => ({
      ...s,
      messages: s.messages.filter(m => m.role !== 'tool_call'),
    }));
    chrome.storage.local.set({ [CHAT_STORAGE_KEY]: toSave });
  } catch {}
}

function executeSideEffect(msg: Record<string, unknown>) {
  if (msg.action === 'close_chrome_tabs' && Array.isArray(msg.chromeTabIds)) {
    for (const tabId of msg.chromeTabIds) {
      if (typeof tabId === 'number' && tabId > 0) {
        chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId }).catch(() => {});
      }
    }
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isStreaming: false,
  agentMode: true,

  createSession: () => {
    const id = crypto.randomUUID();
    const session: ChatSession = { id, title: '新对话', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
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

  toggleAgentMode: () => set(s => ({ agentMode: !s.agentMode })),

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
      const model = useSettingsStore.getState().selectedModel;
      const session = get().sessions.find(s => s.id === sessionId);
      const history = session?.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(0, -1)
        .map(m => ({ role: m.role, content: m.content })) || [];

      const agentMode = get().agentMode;

      for await (const msg of fetchSSE('/api/ai/chat', {
        messages: history,
        model: model || undefined,
        agent: agentMode,
      })) {
        if (msg.type === 'chunk') {
          appendToAssistant(sessionId!, msg.content as string);
        } else if (msg.type === 'tool_call') {
          set(state => ({
            sessions: state.sessions.map(s =>
              s.id === sessionId ? {
                ...s,
                messages: [...s.messages, {
                  role: 'tool_call' as const,
                  content: '',
                  timestamp: Date.now(),
                  toolName: msg.name as string,
                  toolCallId: msg.toolCallId as string,
                  collapsed: true,
                }],
              } : s
            ),
          }));
        } else if (msg.type === 'tool_result') {
          executeSideEffect(msg);
          set(state => ({
            sessions: state.sessions.map(s =>
              s.id === sessionId ? {
                ...s,
                messages: s.messages.map(m =>
                  m.role === 'tool_call' && m.toolCallId === msg.toolCallId
                    ? {
                        role: 'tool_result' as const,
                        content: msg.display as string,
                        timestamp: Date.now(),
                        toolName: msg.name as string,
                        toolCallId: msg.toolCallId as string,
                        collapsed: true,
                      }
                    : m
                ),
              } : s
            ),
          }));
        } else if (msg.type === 'done') {
          // stream ended after tool use without final text
        }
      }
    } catch (err) {
      const errText = `Error: ${(err as Error).message}`;
      appendToAssistant(sessionId!, errText);
    } finally {
      // Remove empty assistant messages left after tool-only responses
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

function appendToAssistant(sessionId: string, text: string) {
  useChatStore.setState(state => ({
    sessions: state.sessions.map(s => {
      if (s.id !== sessionId) return s;
      const last = s.messages[s.messages.length - 1];
      if (last?.role === 'assistant') {
        return {
          ...s,
          messages: s.messages.map((m, i) =>
            i === s.messages.length - 1 ? { ...m, content: m.content + text } : m
          ),
        };
      }
      return {
        ...s,
        messages: [...s.messages, { role: 'assistant' as const, content: text, timestamp: Date.now() }],
      };
    }),
  }));
}

if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  chrome.storage.local.get(CHAT_STORAGE_KEY).then(result => {
    const sessions = result[CHAT_STORAGE_KEY];
    if (Array.isArray(sessions) && sessions.length) {
      useChatStore.setState({ sessions, activeSessionId: sessions[0]?.id || null });
    }
  }).catch(() => {});
}
