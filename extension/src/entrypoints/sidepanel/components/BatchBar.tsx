import { useState } from 'react';
import { useTabStore } from '../stores/tab-store';
import { useSettingsStore } from '../stores/settings-store';
import { api } from '@/lib/api';
import { X, Sparkles, FileEdit, Star, Loader2, CheckCircle } from 'lucide-react';
import { useAIStore } from '../stores/ai-store';
import type { ExportTarget, ExportDepth } from '@/lib/types';
import { cn } from '@/lib/utils';

export function BatchBar() {
  const { selectedIds, clearSelection, tabs, removeTab, fetchTabs } = useTabStore();
  const { startClassify } = useAIStore();
  const { selectedModel } = useSettingsStore();
  const [showBatchExport, setShowBatchExport] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [batchTarget, setBatchTarget] = useState<ExportTarget>('apple_notes');
  const [batchDepth, setBatchDepth] = useState<ExportDepth>('light');
  const [batchFolder, setBatchFolder] = useState('MindShelf');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ success: number; fail: number } | null>(null);

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
      await api.tabs.batchStatus(ids, 'closed');
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
      try {
        const r = await api.export.single(id, { target: batchTarget, depth: batchDepth, folder: batchFolder, model: selectedModel || undefined });
        if (r.success) success++; else fail++;
      } catch { fail++; }
    }
    setExporting(false);
    setExportResult({ success, fail });
    fetchTabs();
  };

  const handleBatchScore = async (score: number) => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await api.export.score(id, score);
        useTabStore.getState().updateTab(id, { user_score: score });
      } catch {}
    }
    setShowScore(false);
  };

  return (
    <div className="border-t border-border bg-muted/30 shrink-0">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">已选 {selectedIds.size} 项</span>
        <div className="flex items-center gap-1">
          <button onClick={() => startClassify(Array.from(selectedIds))} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Sparkles className="h-3 w-3" /> 分类
          </button>
          <button onClick={() => { setShowBatchExport(!showBatchExport); setShowScore(false); }} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20">
            <FileEdit className="h-3 w-3" /> 批量笔记
          </button>
          <button onClick={() => { setShowScore(!showScore); setShowBatchExport(false); }} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-amber-100 text-amber-700 hover:bg-amber-200">
            <Star className="h-3 w-3" /> 评分
          </button>
          <button onClick={handleCloseBatch} className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20">
            <X className="h-3 w-3" /> 关闭
          </button>
          <button onClick={clearSelection} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">取消</button>
        </div>
      </div>

      {/* Batch Score */}
      {showScore && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">评分：</span>
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
          <div className="flex gap-1.5">
            {(['light', 'standard', 'full'] as const).map(d => (
              <button key={d} onClick={() => setBatchDepth(d)} className={cn('flex-1 h-6 rounded text-[10px]', batchDepth === d ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-muted-foreground')}>
                {d === 'light' ? '轻量' : d === 'standard' ? '标准' : '完整'}
              </button>
            ))}
          </div>
          <input
            value={batchFolder}
            onChange={e => setBatchFolder(e.target.value)}
            className="w-full h-7 px-2.5 text-xs rounded-lg border border-border bg-background"
            placeholder="文件夹"
          />
          <button
            onClick={handleBatchExport}
            disabled={exporting}
            className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {exporting ? <><Loader2 className="h-3 w-3 animate-spin" /> 导出中...</> : `保存 ${selectedIds.size} 个标签为笔记`}
          </button>
          {exportResult && (
            <div className={cn('flex items-center gap-1.5 text-xs', exportResult.fail === 0 ? 'text-green-600' : 'text-amber-600')}>
              <CheckCircle className="h-3 w-3" />
              成功 {exportResult.success}{exportResult.fail > 0 && `，失败 ${exportResult.fail}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
