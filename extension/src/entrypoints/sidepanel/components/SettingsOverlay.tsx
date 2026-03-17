import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore, type NoteStyle, type ExtractorType, type QuickPrompt } from '../stores/settings-store';
import { useNavStore } from '../stores/nav-store';
import { X, Cpu, Server, FileText, FolderOpen, Wand2, Zap, Plus, Trash2, Pencil, Check } from 'lucide-react';
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

export function SettingsOverlay() {
  const s = useSettingsStore();
  const { toggleSettings } = useNavStore();
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editText, setEditText] = useState('');

  const addPrompt = () => {
    if (!newPromptName.trim() || !newPromptText.trim()) return;
    s.setQuickPrompts([...s.quickPrompts, { name: newPromptName.trim(), prompt: newPromptText.trim() }]);
    setNewPromptName('');
    setNewPromptText('');
  };

  const removePrompt = (idx: number) => {
    s.setQuickPrompts(s.quickPrompts.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditName(s.quickPrompts[idx].name);
    setEditText(s.quickPrompts[idx].prompt);
  };

  const confirmEdit = () => {
    if (editingIdx === null || !editName.trim() || !editText.trim()) return;
    const updated = [...s.quickPrompts];
    updated[editingIdx] = { name: editName.trim(), prompt: editText.trim() };
    s.setQuickPrompts(updated);
    setEditingIdx(null);
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
          {/* AI Model */}
          <Section icon={<Cpu className="h-3.5 w-3.5" />} label="AI 模型">
            {s.availableModels.length > 0 ? (
              <select value={s.selectedModel} onChange={e => s.setModel(e.target.value)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background">
                {s.availableModels.map(m => <option key={m.model} value={m.model}>{m.label}{m.isDefault ? ' (默认)' : ''}</option>)}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">无法加载模型列表</p>
            )}
          </Section>

          {/* Backend */}
          <Section icon={<Server className="h-3.5 w-3.5" />} label="后端地址">
            <input type="text" value={s.backendUrl} onChange={e => s.setBackendUrl(e.target.value)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background" />
          </Section>

          {/* Default Export Target */}
          <Section icon={<FileText className="h-3.5 w-3.5" />} label="默认导出目标">
            <div className="flex gap-1.5">
              {([['apple_notes', '🍎 Apple Notes'], ['obsidian', '💎 Obsidian']] as const).map(([val, label]) => (
                <button key={val} onClick={() => s.setDefaultExportTarget(val)} className={cn('flex-1 h-7 text-[11px] rounded-lg border transition-colors', s.defaultExportTarget === val ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted')}>
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* Default Folder */}
          <Section icon={<FolderOpen className="h-3.5 w-3.5" />} label="默认文件夹">
            <input type="text" value={s.defaultFolder} onChange={e => s.setDefaultFolder(e.target.value)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background" placeholder="MindShelf" />
          </Section>

          {/* Default Extractor */}
          <Section icon={<FileText className="h-3.5 w-3.5" />} label="内容提取方式">
            <select value={s.defaultExtractor} onChange={e => s.setDefaultExtractor(e.target.value as ExtractorType)} className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background">
              {EXTRACTORS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </Section>

          {/* Note Style */}
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

          {/* Quick Prompts */}
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
            <p className="text-[10px] text-muted-foreground">MindShelf v4.0 · 设置跨窗口自动同步</p>
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
