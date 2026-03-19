import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore, type NoteStyle, type ExtractorType, type QuickPrompt, type ModelProvider } from '../stores/settings-store';
import { useNavStore } from '../stores/nav-store';
import { getBackendAvailable } from '@/lib/backend-status';
import type { AIProvider } from '@/lib/ai-client';
import { X, Cpu, Server, FileText, FolderOpen, Wand2, Zap, Plus, Trash2, Pencil, Check, Key, Globe, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const NOTE_STYLES: { value: NoteStyle; label: string; desc: string }[] = [
  { value: 'concise', label: '简练', desc: '要点列表，省略细节' },
  { value: 'detailed', label: '详细', desc: '完整信息，保留结构' },
  { value: 'deep', label: '深度', desc: '分析性笔记，加入洞察' },
  { value: 'custom', label: '自定义', desc: '使用自定义提示词' },
];

const EXTRACTORS: { value: ExtractorType; label: string }[] = [
  { value: 'defuddle', label: 'Defuddle (推荐)' },
  { value: 'readability', label: 'Readability' },
  { value: 'innerText', label: '纯文本' },
];

const PROVIDER_TYPES: { value: AIProvider; label: string; placeholder: string; defaultModels: string[] }[] = [
  { value: 'openai', label: 'OpenAI / 兼容 API', placeholder: 'sk-...', defaultModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] },
  { value: 'anthropic', label: 'Anthropic Claude', placeholder: 'sk-ant-...', defaultModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'] },
];

function ProviderCard({ provider, isActive, onActivate }: { provider: ModelProvider; isActive: boolean; onActivate: () => void }) {
  const s = useSettingsStore();
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [newModel, setNewModel] = useState('');

  const typeInfo = PROVIDER_TYPES.find(p => p.value === provider.type) || PROVIDER_TYPES[0];

  const addModel = () => {
    if (!newModel.trim()) return;
    const models = [...provider.models, newModel.trim()];
    s.updateProvider(provider.id, { models });
    if (isActive && !s.activeModel) s.setActiveModel(newModel.trim());
    setNewModel('');
  };

  const removeModel = (model: string) => {
    const models = provider.models.filter(m => m !== model);
    s.updateProvider(provider.id, { models });
    if (s.activeModel === model) s.setActiveModel(models[0] || '');
  };

  return (
    <div className={cn('rounded-lg border transition-colors', isActive ? 'border-primary/50 bg-primary/5' : 'border-border')}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{provider.name}</div>
          <div className="text-[9px] text-muted-foreground">{typeInfo.label} · {provider.models.length} 个模型</div>
        </div>
        {!isActive && (
          <button onClick={e => { e.stopPropagation(); onActivate(); }} className="px-1.5 py-0.5 text-[9px] rounded bg-muted hover:bg-muted/80 text-muted-foreground shrink-0">
            激活
          </button>
        )}
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground/50 shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50">
          <div className="flex gap-1.5 pt-2">
            {PROVIDER_TYPES.map(t => (
              <button key={t.value} onClick={() => s.updateProvider(provider.id, { type: t.value })}
                className={cn('flex-1 h-6 text-[10px] rounded border transition-colors', provider.type === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}>
                {t.label}
              </button>
            ))}
          </div>

          <input value={provider.name} onChange={e => s.updateProvider(provider.id, { name: e.target.value })}
            placeholder="显示名称" className="w-full h-7 px-2 text-[11px] rounded border border-border bg-background" />

          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={provider.apiKey} onChange={e => s.updateProvider(provider.id, { apiKey: e.target.value })}
              placeholder={typeInfo.placeholder} className="w-full h-7 px-2 pr-12 text-[11px] rounded border border-border bg-background font-mono" />
            <button onClick={() => setShowKey(!showKey)} className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] rounded bg-muted hover:bg-muted/80">
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>

          {provider.type === 'openai' && (
            <input value={provider.baseUrl || ''} onChange={e => s.updateProvider(provider.id, { baseUrl: e.target.value || undefined })}
              placeholder="Base URL（留空使用默认）" className="w-full h-7 px-2 text-[11px] rounded border border-border bg-background" />
          )}

          <div className="space-y-1">
            <label className="text-[9px] text-muted-foreground">模型列表</label>
            <div className="flex flex-wrap gap-1">
              {provider.models.map(m => (
                <span key={m} className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full border',
                  isActive && m === s.activeModel ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                  {isActive && <button onClick={() => s.setActiveModel(m)} className="hover:text-primary">{m}</button>}
                  {!isActive && m}
                  <button onClick={() => removeModel(m)} className="hover:text-destructive ml-0.5">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input value={newModel} onChange={e => setNewModel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addModel()}
                placeholder="添加模型名称" list={`models-${provider.id}`} className="flex-1 h-6 px-2 text-[10px] rounded border border-border bg-background" />
              <datalist id={`models-${provider.id}`}>{typeInfo.defaultModels.map(m => <option key={m} value={m} />)}</datalist>
              <button onClick={addModel} className="px-2 h-6 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20"><Plus className="h-2.5 w-2.5" /></button>
            </div>
          </div>

          <button onClick={() => s.removeProvider(provider.id)} className="flex items-center gap-1 text-[10px] text-destructive/70 hover:text-destructive mt-1">
            <Trash2 className="h-2.5 w-2.5" /> 删除此服务商
          </button>
        </div>
      )}
    </div>
  );
}

export function SettingsOverlay() {
  const s = useSettingsStore();
  const { toggleSettings } = useNavStore();
  const backendAvailable = getBackendAvailable();
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editText, setEditText] = useState('');

  const addProvider = () => {
    s.addProvider({ type: 'openai', name: '新服务商', apiKey: '', models: [] });
  };

  const addPrompt = () => {
    if (!newPromptName.trim() || !newPromptText.trim()) return;
    s.setQuickPrompts([...s.quickPrompts, { name: newPromptName.trim(), prompt: newPromptText.trim() }]);
    setNewPromptName(''); setNewPromptText('');
  };

  const removePrompt = (idx: number) => {
    s.setQuickPrompts(s.quickPrompts.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const startEdit = (idx: number) => { setEditingIdx(idx); setEditName(s.quickPrompts[idx].name); setEditText(s.quickPrompts[idx].prompt); };
  const confirmEdit = () => {
    if (editingIdx === null || !editName.trim() || !editText.trim()) return;
    const updated = [...s.quickPrompts];
    updated[editingIdx] = { name: editName.trim(), prompt: editText.trim() };
    s.setQuickPrompts(updated); setEditingIdx(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex" style={{ isolation: 'isolate' }}>
      <div className="absolute inset-0 bg-black/30" onClick={toggleSettings} />
      <div className="relative ml-auto w-full max-w-[360px] bg-background border-l border-border overflow-auto animate-in slide-in-from-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-sm font-semibold">设置</h2>
          <button onClick={toggleSettings} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-4 py-3 space-y-5">
          {/* AI Providers */}
          <Section icon={<Cpu className="h-3.5 w-3.5" />} label="AI 服务商">
            <div className="space-y-2">
              {s.providers.map(p => (
                <ProviderCard key={p.id} provider={p} isActive={p.id === s.activeProviderId}
                  onActivate={() => s.setActiveProvider(p.id)} />
              ))}
              <button onClick={addProvider} className="w-full h-8 text-[11px] rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted/50 hover:border-primary/30 transition-colors flex items-center justify-center gap-1">
                <Plus className="h-3 w-3" /> 添加服务商
              </button>

              {!s.providers.length && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[10px]">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  未配置服务商，AI 功能不可用
                </div>
              )}
              {s.isAIConfigured() && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  当前：{s.getActiveProvider()?.name} / {s.activeModel}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground">Agent 最大对话轮数</label>
                <div className="flex items-center gap-2">
                  <input type="range" min={1} max={20} value={s.maxAgentSteps} onChange={e => s.setMaxAgentSteps(Number(e.target.value))} className="flex-1 h-1 accent-primary" />
                  <span className="text-xs font-mono w-6 text-center">{s.maxAgentSteps}</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Backend */}
          <Section icon={<Server className="h-3.5 w-3.5" />} label="后端服务（可选）">
            <input type="text" value={s.backendUrl} onChange={e => s.setBackendUrl(e.target.value)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background" />
            <div className={cn('flex items-center gap-1.5 mt-1.5 text-[10px]', backendAvailable ? 'text-green-600' : 'text-muted-foreground/60')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', backendAvailable ? 'bg-green-500' : 'bg-muted-foreground/30')} />
              {backendAvailable ? '后端已连接 · 导出功能可用' : '后端未连接 · 仅本地功能'}
            </div>
          </Section>

          {backendAvailable && (
            <Section icon={<FileText className="h-3.5 w-3.5" />} label="默认导出目标">
              <div className="flex gap-1.5">
                {([['apple_notes', '🍎 Apple Notes'], ['obsidian', '💎 Obsidian']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => s.setDefaultExportTarget(val)} className={cn('flex-1 h-7 text-[11px] rounded-lg border transition-colors', s.defaultExportTarget === val ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted')}>
                    {label}
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section icon={<FolderOpen className="h-3.5 w-3.5" />} label="默认文件夹">
            <input type="text" value={s.defaultFolder} onChange={e => s.setDefaultFolder(e.target.value)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background" placeholder="MindShelf" />
          </Section>

          <Section icon={<FileText className="h-3.5 w-3.5" />} label="内容提取方式">
            <select value={s.defaultExtractor} onChange={e => s.setDefaultExtractor(e.target.value as ExtractorType)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background">
              {EXTRACTORS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </Section>

          <Section icon={<Wand2 className="h-3.5 w-3.5" />} label="笔记风格">
            <div className="grid grid-cols-2 gap-1.5">
              {NOTE_STYLES.map(ns => (
                <button key={ns.value} onClick={() => s.setNoteStyle(ns.value)} className={cn('px-2 py-1.5 rounded-lg border text-left transition-colors', s.noteStyle === ns.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}>
                  <div className="text-[11px] font-medium">{ns.label}</div>
                  <div className="text-[9px] text-muted-foreground">{ns.desc}</div>
                </button>
              ))}
            </div>
            {s.noteStyle === 'custom' && (
              <textarea value={s.customStylePrompt} onChange={e => s.setCustomStylePrompt(e.target.value)} placeholder="描述你想要的笔记风格..." className="w-full h-16 mt-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background resize-none" />
            )}
          </Section>

          <Section icon={<Zap className="h-3.5 w-3.5" />} label="快捷指令">
            <div className="space-y-1.5">
              {s.quickPrompts.map((p, i) => (
                <div key={i}>
                  {editingIdx === i ? (
                    <div className="space-y-1 p-1.5 rounded-lg border border-primary/30 bg-primary/5">
                      <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full h-6 px-1.5 text-[10px] rounded border border-border bg-background" />
                      <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full h-14 px-1.5 py-1 text-[10px] rounded border border-border bg-background resize-none" />
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditingIdx(null)} className="px-1.5 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground">取消</button>
                        <button onClick={confirmEdit} className="px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-0.5"><Check className="h-2.5 w-2.5" />保存</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 group">
                      <div className="flex-1 px-2 py-1 rounded bg-muted text-[10px] truncate" title={p.prompt}>{p.name}</div>
                      <button onClick={() => startEdit(i)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => removePrompt(i)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-500"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-1 mt-1">
                <input value={newPromptName} onChange={e => setNewPromptName(e.target.value)} placeholder="名称" className="w-16 h-6 px-1.5 text-[10px] rounded border border-border bg-background" />
                <input value={newPromptText} onChange={e => setNewPromptText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPrompt()} placeholder="指令内容" className="flex-1 h-6 px-1.5 text-[10px] rounded border border-border bg-background" />
                <button onClick={addPrompt} className="p-1 rounded bg-primary/10 text-primary hover:bg-primary/20"><Plus className="h-3 w-3" /></button>
              </div>
            </div>
          </Section>

          <div className="pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              MindShelf · AI 在前端直接调用{backendAvailable ? ' · 后端提供导出' : ''}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">{icon}{label}</label>
      {children}
    </div>
  );
}
