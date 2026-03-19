import { useState } from 'react';
import { useTabStore } from '../stores/tab-store';
import { api } from '@/lib/api';
import { X, Sparkles, FileEdit, Star, Loader2, CheckCircle } from 'lucide-react';
import { useAIStore } from '../stores/ai-store';
import type { ExportTarget } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export function BatchBar() {
  const { selectedIds, clearSelection, tabs, removeTab, fetchTabs } = useTabStore();
  const { startClassify } = useAIStore();
  const [showBatchExport, setShowBatchExport] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [batchTarget, setBatchTarget] = useState<ExportTarget>('apple_notes');
  const [batchFolder, setBatchFolder] = useState('MindShelf');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ success: number; fail: number } | null>(null);

  const { t } = useT();
  if (selectedIds.size === 0) return null;

  const handleCloseBatch = async () => {
    const ids = Array.from(selectedIds);
    try {
      for (const id of ids) {
        const tab = tabs.find((t) => t.id === id);
        if (tab?.source_tab_id) {
          chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.source_tab_id });
        }
      }
      for (const id of ids) removeTab(id);
      clearSelection();
    } catch (err) {
      console.error('Batch close failed:', err);
    }
  };

  const handleBatchExport = async () => {
    setExporting(true);
    setExportResult(null);
    const ids = Array.from(selectedIds);
    let success = 0, fail = 0;
    for (const id of ids) {
      const tab = tabs.find(t => t.id === id);
      if (!tab) { fail++; continue; }
      try {
        const r = await api.export.single({
          title: tab.title,
          url: tab.url,
          domain: tab.domain,
          topic: tab.topic || undefined,
          tags: tab.tags,
          userScore: tab.user_score || undefined,
              content: tab.content_text?.substring(0, 30000) || t('batch.noContent'),
          target: batchTarget,
          folder: batchFolder,
        });
        if (r.success) success++; else fail++;
      } catch { fail++; }
    }
    setExporting(false);
    setExportResult({ success, fail });
    fetchTabs();
  };

  const handleBatchScore = (score: number) => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      useTabStore.getState().updateTab(id, { user_score: score });
    }
    setShowScore(false);
  };

  return (
    <div className="border-t border-border bg-muted/30 shrink-0">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{t('batch.selected', { count: selectedIds.size })}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => startClassify(Array.from(selectedIds))} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Sparkles className="h-3 w-3" /> {t('batch.classify')}
          </button>
          <button onClick={() => { setShowBatchExport(!showBatchExport); setShowScore(false); }} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20">
            <FileEdit className="h-3 w-3" /> {t('batch.batchNote')}
          </button>
          <button onClick={() => { setShowScore(!showScore); setShowBatchExport(false); }} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200">
            <Star className="h-3 w-3" /> {t('batch.score')}
          </button>
          <button onClick={handleCloseBatch} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20">
            <X className="h-3 w-3" /> {t('batch.close')}
          </button>
          <button onClick={clearSelection} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">{t('batch.cancel')}</button>
        </div>
      </div>

      {/* Batch Score */}
      {showScore && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('batch.scoreLabel')}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(score => (
              <button key={score} onClick={() => handleBatchScore(score)} className="text-sm text-muted-foreground/30 hover:text-amber-500 transition-colors">★</button>
            ))}
          </div>
        </div>
      )}

      {/* Batch Export */}
      {showBatchExport && (
        <div className="px-3 pb-2 space-y-2">
          <div className="flex gap-2">
            <button onClick={() => setBatchTarget('apple_notes')} className={cn('flex-1 h-7 rounded-lg border text-xs', batchTarget === 'apple_notes' ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted')}>
              🍎 Apple Notes
            </button>
            <button onClick={() => setBatchTarget('obsidian')} className={cn('flex-1 h-7 rounded-lg border text-xs', batchTarget === 'obsidian' ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted')}>
              💎 Obsidian
            </button>
          </div>
          <input
            value={batchFolder}
            onChange={e => setBatchFolder(e.target.value)}
            className="w-full h-7 px-2.5 text-xs rounded-lg border border-border bg-background"
            placeholder={t('batch.folder')}
          />
          <button
            onClick={handleBatchExport}
            disabled={exporting}
            className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {exporting ? <><Loader2 className="h-3 w-3 animate-spin" /> {t('batch.exporting')}</> : t('batch.saveNotes', { count: selectedIds.size })}
          </button>
          {exportResult && (
            <div className={cn('flex items-center gap-1.5 text-xs', exportResult.fail === 0 ? 'text-green-600' : 'text-amber-600')}>
              <CheckCircle className="h-3 w-3" />
              {t('batch.success', { count: exportResult.success })}{exportResult.fail > 0 && `, ${t('batch.failed', { count: exportResult.fail })}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
