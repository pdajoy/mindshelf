import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { extractFromHTML, type PageContent, type ExtractorType } from '@/lib/content-extractor';
import { streamNoteOptimize } from '@/lib/ai-chat';
import { useTabStore } from '../stores/tab-store';
import { useSettingsStore } from '../stores/settings-store';
import { getBackendAvailable } from '@/lib/backend-status';
import { MarkdownPreview } from './MarkdownPreview';
import { ScoreRating } from './ScoreRating';
import type { TabRecord, ExportTarget } from '@/lib/types';
import {
  X, Download, Sparkles, Eye, Edit3, Loader2, CheckCircle,
  AlertCircle, Send, ChevronDown, ChevronUp, RefreshCw,
  Zap, Link, Tag, FolderOpen, FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface NoteDialogProps {
  tab: TabRecord;
  onClose: () => void;
}

export function NoteDialog({ tab, onClose }: NoteDialogProps) {
  const { t } = useT();
  const settings = useSettingsStore();
  const { fetchTabs } = useTabStore();
  const backendAvailable = getBackendAvailable();

  const [target, setTarget] = useState<ExportTarget>(settings.defaultExportTarget);
  const [folder, setFolder] = useState(tab.topic ? `${settings.defaultFolder}/${tab.topic}` : settings.defaultFolder);
  const [folders, setFolders] = useState<string[]>([]);
  const [extractor, setExtractor] = useState<ExtractorType>(settings.defaultExtractor);
  const [closeAfterExport, setCloseAfterExport] = useState(false);

  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const [extracting, setExtracting] = useState(false);

  const [markdown, setMarkdown] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [contentEdited, setContentEdited] = useState(false);
  const [savedMarkdown, setSavedMarkdown] = useState<string | null>(null);

  const [aiInput, setAiInput] = useState('');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiHistory, setAiHistory] = useState<Array<{ prompt: string }>>([]);

  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const htmlRef = useRef<string | null>(null);
  const tags = Array.isArray(tab.tags) ? tab.tags : [];

  useEffect(() => {
    if (!backendAvailable) return;
    const load = target === 'apple_notes'
      ? api.export.appleNotesFolders().then(r => setFolders(r.folders.map((f: any) => f.name)))
      : api.export.obsidianFolders().then(r => setFolders(r.folders));
    load.catch(() => {});
  }, [target, backendAvailable]);

  useEffect(() => {
    if (!tab.source_tab_id) {
      if (tab.content_text) {
        setMarkdown(tab.content_text);
      }
      return;
    }
    setExtracting(true);
    chrome.runtime.sendMessage({ type: 'EXTRACT_HTML', tabId: tab.source_tab_id })
      .then((res: any) => {
        if (res?.html) {
          htmlRef.current = res.html;
          runExtraction(res.html, extractor);
        } else {
          buildFromCache();
        }
      })
      .catch(() => buildFromCache())
      .finally(() => setExtracting(false));
  }, [tab.source_tab_id]);

  const runExtraction = useCallback((html: string, method: ExtractorType) => {
    setExtracting(true);
    try {
      const pc = extractFromHTML(html, tab.url, method);
      setPageContent(pc);
      if (!contentEdited) buildMarkdown(pc);
    } catch {
      buildFromCache();
    }
    setExtracting(false);
  }, [tab.url, contentEdited]);

  const buildFromCache = () => {
    const lines: string[] = [];
    if (tab.content_text) lines.push(`## ${t('note.content')}\n`, tab.content_text.substring(0, 20000));
    if (!lines.length) lines.push(t('note.noContent'));
    setMarkdown(lines.join('\n'));
  };

  const buildMarkdown = (pc: PageContent) => {
    const lines: string[] = [];
    if (pc.markdown) {
      lines.push(`## ${t('note.content')}\n`, pc.markdown.substring(0, 30000));
    }
    if (!lines.length) lines.push(pc.plainText || t('note.noContent'));
    setMarkdown(lines.join('\n'));
  };

  useEffect(() => {
    if (contentEdited || !htmlRef.current) return;
    runExtraction(htmlRef.current, extractor);
  }, [extractor]);

  const noteStylePrompt = (): string => {
    const styles: Record<string, string> = {
      concise: '简练风格：提取核心要点，用列表呈现，省略废话。',
      detailed: '详细风格：完整保留信息，条理清晰。',
      deep: '深度风格：分析性笔记，加入洞察和联想。',
      custom: settings.customStylePrompt || '',
    };
    return styles[settings.noteStyle] || styles.concise;
  };

  const handleAIOptimize = async () => {
    if (!aiInput.trim() || aiStreaming) return;
    if (!settings.isAIConfigured()) return;

    const prompt = aiInput;
    setAiInput('');
    setAiStreaming(true);

    try {
      let out = '';
      const config = settings.getAIConfig();
      for await (const chunk of streamNoteOptimize(
        prompt, markdown,
        { title: tab.title, url: tab.url, topic: tab.topic, tags },
        config,
        { stylePrompt: noteStylePrompt() },
      )) {
        out += chunk;
      }
      if (out) {
        setMarkdown(out);
        setContentEdited(true);
        setAiHistory(prev => [...prev, { prompt }]);
      }
    } catch (err) {
      console.error('AI optimize failed:', err);
    }
    setAiStreaming(false);
  };

  const handleExport = async () => {
    if (!backendAvailable) {
      handleDownloadMD();
      return;
    }
    setExporting(true);
    setResult(null);
    try {
      const r = await api.export.single({
        title: tab.title,
        url: tab.url,
        domain: tab.domain,
        topic: tab.topic || undefined,
        tags: tab.tags,
        userScore: tab.user_score || undefined,
        content: markdown,
        target,
        folder,
      });
      setResult({ success: r.success, error: r.error });
      if (r.success) {
        setSavedMarkdown(markdown);
        fetchTabs();
        if (closeAfterExport && tab.source_tab_id) {
          chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.source_tab_id });
        }
      }
    } catch (err) {
      setResult({ success: false, error: (err as Error).message });
    }
    setExporting(false);
  };

  const handleDownloadMD = () => {
    const safeTitle = tab.title.replace(/[/\\:*?"<>|]/g, '_').substring(0, 80);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canReExport = result?.success === true && savedMarkdown !== markdown;
  const isExported = result?.success === true && savedMarkdown === markdown;

  const metaBadges = [
    tab.domain && { icon: <Link className="h-2.5 w-2.5" />, text: tab.domain },
    tab.topic && { icon: <FolderOpen className="h-2.5 w-2.5" />, text: tab.topic },
    tags.length > 0 && { icon: <Tag className="h-2.5 w-2.5" />, text: tags.slice(0, 3).map(t => `#${t}`).join(' ') },
    tab.user_score && { icon: null, text: `${tab.user_score}/10` },
    pageContent && { icon: null, text: `${t('note.words', { count: pageContent.wordCount })} · ${pageContent.extractedBy}` },
  ].filter(Boolean) as Array<{ icon: React.ReactNode; text: string }>;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background" style={{ isolation: 'isolate' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg">📝</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate leading-tight">{t('note.title')}</h3>
            <p className="text-[10px] text-muted-foreground truncate max-w-[240px] mt-0.5">{tab.title}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted shrink-0"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        {/* Export Target */}
        {backendAvailable && (
          <section className="space-y-2">
            <div className="flex gap-2">
              <button onClick={() => setTarget('apple_notes')} className={cn('flex-1 h-9 rounded-lg border text-xs font-medium transition-all', target === 'apple_notes' ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-border hover:bg-muted')}>🍎 Apple Notes</button>
              <button onClick={() => setTarget('obsidian')} className={cn('flex-1 h-9 rounded-lg border text-xs font-medium transition-all', target === 'obsidian' ? 'border-primary bg-primary/10 text-primary shadow-sm' : 'border-border hover:bg-muted')}>💎 Obsidian</button>
            </div>
          </section>
        )}

        {/* Settings Row */}
        <section className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('note.extractMethod')}</label>
            <div className="flex gap-1">
              {([['defuddle', 'Defuddle'], ['readability', 'Reader'], ['innerText', t('note.plainText')]] as [ExtractorType, string][]).map(([v, l]) => (
                <button key={v} onClick={() => { setExtractor(v); setContentEdited(false); }} className={cn('flex-1 h-7 rounded-md text-[10px] transition-all', extractor === v ? 'bg-primary text-primary-foreground font-medium shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('note.folderLabel')}</label>
            <input type="text" value={folder} onChange={e => setFolder(e.target.value)} list="note-folder-list" className="w-full h-7 px-2 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            <datalist id="note-folder-list">{folders.map(f => <option key={f} value={f} />)}</datalist>
          </div>
        </section>

        {/* Rating + Meta */}
        <section className="space-y-2">
          <ScoreRating tabId={tab.id} currentScore={tab.user_score} />
          {metaBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {metaBadges.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted/70 text-[10px] text-muted-foreground">
                  {b.icon} {b.text}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Content Editor */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold">{t('note.noteContent')}</label>
              {contentEdited && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">{t('note.edited')}</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsEditing(!isEditing)} className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all', isEditing ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted')}>
                {isEditing ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
                {isEditing ? t('note.preview') : t('note.edit')}
              </button>
              <button onClick={() => { setContentEdited(false); if (htmlRef.current) runExtraction(htmlRef.current, extractor); else buildFromCache(); }} disabled={extracting} className="p-1 rounded-md text-muted-foreground hover:bg-muted" title={t('note.reExtract')}>
                {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            {isEditing ? (
              <textarea value={markdown} onChange={e => { setMarkdown(e.target.value); setContentEdited(true); }} className="w-full min-h-[280px] px-3 py-2.5 text-xs bg-transparent resize-y font-mono leading-relaxed focus:outline-none" />
            ) : (
              <div className="max-h-[400px] overflow-auto px-3 py-2.5">
                {extracting ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> {t('note.extracting')}</div>
                ) : markdown ? (
                  <MarkdownPreview content={markdown} className="text-xs" />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-8">{t('note.noContent')}</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* AI Optimization */}
        <section className="space-y-2">
          <button onClick={() => setShowAI(!showAI)} className="flex items-center gap-1.5 text-xs font-semibold text-primary/80 hover:text-primary transition-colors">
            <Sparkles className="h-3.5 w-3.5" /> {t('note.aiOptimize')}
            {showAI ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showAI && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/20 border border-border/60">
              {!settings.isAIConfigured() && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{t('note.configureAI')}</p>
              )}
              {settings.quickPrompts.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {settings.quickPrompts.map(p => (
                    <button key={p.name} onClick={() => setAiInput(p.prompt)} className="px-2.5 py-1 text-[10px] rounded-md bg-background border border-border hover:border-primary/50 transition-colors">
                      <Zap className="h-2.5 w-2.5 inline mr-0.5" />{p.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAIOptimize()} placeholder={t('note.customInstruction')} disabled={aiStreaming || !settings.isAIConfigured()} className="flex-1 h-8 px-3 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                <button onClick={handleAIOptimize} disabled={!aiInput.trim() || aiStreaming || !settings.isAIConfigured()} className="px-3 h-8 rounded-lg bg-primary text-primary-foreground text-xs disabled:opacity-50 flex items-center gap-1.5 shrink-0">
                  {aiStreaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {t('note.optimize')}
                </button>
              </div>
              {aiHistory.length > 0 && (
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  {aiHistory.map((h, i) => <div key={i} className="flex items-start gap-1"><span className="text-green-500">✓</span><span className="truncate">{h.prompt}</span></div>)}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Options */}
        {backendAvailable && (
          <section>
            <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={closeAfterExport} onChange={e => setCloseAfterExport(e.target.checked)} className="h-3.5 w-3.5 accent-primary rounded" />
              {t('note.closeAfterExport')}
            </label>
          </section>
        )}

        {/* Result */}
        {result && (
          <div className={cn('flex items-center gap-2 rounded-lg p-2.5 text-xs', result.success ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400')}>
            {result.success ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
            {result.success ? (canReExport ? t('note.reExportHint') : t('note.saveSuccess')) : t('note.saveFailed', { error: result.error })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border shrink-0 flex gap-2">
        <button onClick={handleDownloadMD} disabled={!markdown} className="h-9 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-50 flex items-center gap-1.5 shrink-0" title={t('note.downloadMd')}>
          <FileDown className="h-3.5 w-3.5" /> .md
        </button>
        {backendAvailable ? (
          <button onClick={handleExport} disabled={exporting || isExported} className={cn('flex-1 h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all', isExported ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50')}>
            {exporting ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('note.saving')}</> : isExported ? <><CheckCircle className="h-4 w-4" /> {t('note.saved')}</> : <><Download className="h-4 w-4" /> {result?.success ? t('note.reExport') : t('note.exportNote')}</>}
          </button>
        ) : (
          <button onClick={handleDownloadMD} disabled={!markdown} className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
            <FileDown className="h-4 w-4" /> {t('note.downloadMd')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
