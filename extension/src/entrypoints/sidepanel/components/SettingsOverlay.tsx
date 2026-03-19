import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore, type NoteStyle, type ExtractorType, type QuickPrompt, type ModelProvider } from '../stores/settings-store';
import { useNavStore } from '../stores/nav-store';
import { getBackendAvailable } from '@/lib/backend-status';
import type { AIProvider } from '@/lib/ai-client';
import { X, Cpu, Server, FileText, FolderOpen, Wand2, Zap, Plus, Trash2, Pencil, Check, Key, Globe, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { changeLanguage } from '@/lib/i18n';

const PROVIDER_TYPES: { value: AIProvider; labelKey: string; placeholder: string; defaultModels: string[] }[] = [
  { value: 'openai', labelKey: 'settings.provider.openaiCompat', placeholder: 'sk-...', defaultModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] },
  { value: 'anthropic', labelKey: 'settings.provider.anthropic', placeholder: 'sk-ant-...', defaultModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'] },
];

function ProviderCard({ provider, isActive, onActivate }: { provider: ModelProvider; isActive: boolean; onActivate: () => void }) {
  const { t } = useT();
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
          <div className="text-[9px] text-muted-foreground">{t(typeInfo.labelKey)} · {t('settings.provider.models', { count: provider.models.length })}</div>
        </div>
        {!isActive && (
          <button onClick={e => { e.stopPropagation(); onActivate(); }} className="px-1.5 py-0.5 text-[9px] rounded bg-muted hover:bg-muted/80 text-muted-foreground shrink-0">
            {t('settings.provider.activate')}
          </button>
        )}
        {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground/50 shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50">
          <div className="flex gap-1.5 pt-2">
            {PROVIDER_TYPES.map(pt => (
              <button key={pt.value} onClick={() => s.updateProvider(provider.id, { type: pt.value })}
                className={cn('flex-1 h-6 text-[10px] rounded border transition-colors', provider.type === pt.value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}>
                {t(pt.labelKey)}
              </button>
            ))}
          </div>

          <input value={provider.name} onChange={e => s.updateProvider(provider.id, { name: e.target.value })}
            placeholder={t('settings.provider.displayName')} className="w-full h-7 px-2 text-[11px] rounded border border-border bg-background" />

          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={provider.apiKey} onChange={e => s.updateProvider(provider.id, { apiKey: e.target.value })}
              placeholder={typeInfo.placeholder} className="w-full h-7 px-2 pr-12 text-[11px] rounded border border-border bg-background font-mono" />
            <button onClick={() => setShowKey(!showKey)} className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] rounded bg-muted hover:bg-muted/80">
              {showKey ? t('settings.provider.hide') : t('settings.provider.show')}
            </button>
          </div>

          {provider.type === 'openai' && (
            <input value={provider.baseUrl || ''} onChange={e => s.updateProvider(provider.id, { baseUrl: e.target.value || undefined })}
              placeholder={t('settings.provider.baseUrl')} className="w-full h-7 px-2 text-[11px] rounded border border-border bg-background" />
          )}

          <div className="space-y-1">
            <label className="text-[9px] text-muted-foreground">{t('settings.provider.modelList')}</label>
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
                placeholder={t('settings.provider.addModel')} list={`models-${provider.id}`} className="flex-1 h-6 px-2 text-[10px] rounded border border-border bg-background" />
              <datalist id={`models-${provider.id}`}>{typeInfo.defaultModels.map(m => <option key={m} value={m} />)}</datalist>
              <button onClick={addModel} className="px-2 h-6 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20"><Plus className="h-2.5 w-2.5" /></button>
            </div>
          </div>

          <button onClick={() => s.removeProvider(provider.id)} className="flex items-center gap-1 text-[10px] text-destructive/70 hover:text-destructive mt-1">
            <Trash2 className="h-2.5 w-2.5" /> {t('settings.provider.deleteProvider')}
          </button>
        </div>
      )}
    </div>
  );
}

export function SettingsOverlay() {
  const { t } = useT();
  const s = useSettingsStore();
  const { toggleSettings } = useNavStore();
  const backendAvailable = getBackendAvailable();
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editText, setEditText] = useState('');

  const noteStyles: { value: NoteStyle; label: string; desc: string }[] = [
    { value: 'concise', label: t('noteStyle.concise'), desc: t('noteStyle.conciseDesc') },
    { value: 'detailed', label: t('noteStyle.detailed'), desc: t('noteStyle.detailedDesc') },
    { value: 'deep', label: t('noteStyle.deep'), desc: t('noteStyle.deepDesc') },
    { value: 'custom', label: t('noteStyle.custom'), desc: t('noteStyle.customDesc') },
  ];

  const extractors: { value: ExtractorType; label: string }[] = [
    { value: 'defuddle', label: t('settings.defuddle') },
    { value: 'readability', label: t('settings.readability') },
    { value: 'innerText', label: t('settings.plainText') },
  ];

  const addProvider = () => {
    s.addProvider({ type: 'openai', name: t('settings.provider.newProvider'), apiKey: '', models: [] });
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

  const handleLanguageChange = (lang: 'auto' | 'zh' | 'en') => {
    s.setLanguage(lang);
    changeLanguage(lang);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex" style={{ isolation: 'isolate' }}>
      <div className="absolute inset-0 bg-black/30" onClick={toggleSettings} />
      <div className="relative ml-auto w-full max-w-[360px] bg-background border-l border-border overflow-auto animate-in slide-in-from-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
          <h2 className="text-sm font-semibold">{t('settings.title')}</h2>
          <button onClick={toggleSettings} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-4 py-3 space-y-5">
          {/* Language */}
          <Section icon={<Languages className="h-3.5 w-3.5" />} label={t('settings.language')}>
            <div className="flex gap-1.5">
              {([['auto', t('settings.langAuto')], ['zh', t('settings.langZh')], ['en', t('settings.langEn')]] as const).map(([val, label]) => (
                <button key={val} onClick={() => handleLanguageChange(val as 'auto' | 'zh' | 'en')} className={cn('flex-1 h-7 text-[11px] rounded-lg border transition-colors', s.language === val ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted')}>
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* AI Providers */}
          <Section icon={<Cpu className="h-3.5 w-3.5" />} label={t('settings.aiProviders')}>
            <div className="space-y-2">
              {s.providers.map(p => (
                <ProviderCard key={p.id} provider={p} isActive={p.id === s.activeProviderId}
                  onActivate={() => s.setActiveProvider(p.id)} />
              ))}
              <button onClick={addProvider} className="w-full h-8 text-[11px] rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted/50 hover:border-primary/30 transition-colors flex items-center justify-center gap-1">
                <Plus className="h-3 w-3" /> {t('settings.addProvider')}
              </button>

              {!s.providers.length && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[10px]">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {t('settings.noProviderWarning')}
                </div>
              )}
              {s.isAIConfigured() && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  {t('settings.current')}：{s.getActiveProvider()?.name} / {s.activeModel}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground">{t('settings.maxAgentSteps')}</label>
                <div className="flex items-center gap-2">
                  <input type="range" min={1} max={20} value={s.maxAgentSteps} onChange={e => s.setMaxAgentSteps(Number(e.target.value))} className="flex-1 h-1 accent-primary" />
                  <span className="text-xs font-mono w-6 text-center">{s.maxAgentSteps}</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Backend */}
          <Section icon={<Server className="h-3.5 w-3.5" />} label={t('settings.backend')}>
            <input type="text" value={s.backendUrl} onChange={e => s.setBackendUrl(e.target.value)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background" />
            <div className={cn('flex items-center gap-1.5 mt-1.5 text-[10px]', backendAvailable ? 'text-green-600' : 'text-muted-foreground/60')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', backendAvailable ? 'bg-green-500' : 'bg-muted-foreground/30')} />
              {backendAvailable ? t('settings.backendConnected') : t('settings.backendDisconnected')}
            </div>
          </Section>

          {backendAvailable && (
            <Section icon={<FileText className="h-3.5 w-3.5" />} label={t('settings.defaultExport')}>
              <div className="flex gap-1.5">
                {([['apple_notes', '🍎 Apple Notes'], ['obsidian', '💎 Obsidian']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => s.setDefaultExportTarget(val)} className={cn('flex-1 h-7 text-[11px] rounded-lg border transition-colors', s.defaultExportTarget === val ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted')}>
                    {label}
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section icon={<FolderOpen className="h-3.5 w-3.5" />} label={t('settings.defaultFolder')}>
            <input type="text" value={s.defaultFolder} onChange={e => s.setDefaultFolder(e.target.value)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background" placeholder="MindShelf" />
          </Section>

          <Section icon={<FileText className="h-3.5 w-3.5" />} label={t('settings.extractMethod')}>
            <select value={s.defaultExtractor} onChange={e => s.setDefaultExtractor(e.target.value as ExtractorType)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background">
              {extractors.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </Section>

          <Section icon={<Wand2 className="h-3.5 w-3.5" />} label={t('settings.noteStyle')}>
            <div className="grid grid-cols-2 gap-1.5">
              {noteStyles.map(ns => (
                <button key={ns.value} onClick={() => s.setNoteStyle(ns.value)} className={cn('px-2 py-1.5 rounded-lg border text-left transition-colors', s.noteStyle === ns.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}>
                  <div className="text-[11px] font-medium">{ns.label}</div>
                  <div className="text-[9px] text-muted-foreground">{ns.desc}</div>
                </button>
              ))}
            </div>
            {s.noteStyle === 'custom' && (
              <textarea value={s.customStylePrompt} onChange={e => s.setCustomStylePrompt(e.target.value)} placeholder={t('settings.customStylePlaceholder')} className="w-full h-16 mt-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background resize-none" />
            )}
          </Section>

          <Section icon={<Zap className="h-3.5 w-3.5" />} label={t('settings.quickPrompts')}>
            <div className="space-y-1.5">
              {s.quickPrompts.map((p, i) => (
                <div key={i}>
                  {editingIdx === i ? (
                    <div className="space-y-1 p-1.5 rounded-lg border border-primary/30 bg-primary/5">
                      <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full h-6 px-1.5 text-[10px] rounded border border-border bg-background" />
                      <textarea value={editText} onChange={e => setEditText(e.target.value)} className="w-full h-14 px-1.5 py-1 text-[10px] rounded border border-border bg-background resize-none" />
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditingIdx(null)} className="px-1.5 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground">{t('batch.cancel')}</button>
                        <button onClick={confirmEdit} className="px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-0.5"><Check className="h-2.5 w-2.5" />{t('settings.save')}</button>
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
                <input value={newPromptName} onChange={e => setNewPromptName(e.target.value)} placeholder={t('settings.promptName')} className="w-16 h-6 px-1.5 text-[10px] rounded border border-border bg-background" />
                <input value={newPromptText} onChange={e => setNewPromptText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPrompt()} placeholder={t('settings.promptContent')} className="flex-1 h-6 px-1.5 text-[10px] rounded border border-border bg-background" />
                <button onClick={addPrompt} className="p-1 rounded bg-primary/10 text-primary hover:bg-primary/20"><Plus className="h-3 w-3" /></button>
              </div>
            </div>
          </Section>

          <div className="pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              {t('settings.footer')}{backendAvailable ? t('settings.footerBackend') : ''}
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
