import { useState } from 'react';
import { api } from '@/lib/api';
import { useTabStore } from '../stores/tab-store';
import { cn } from '@/lib/utils';

interface ScoreRatingProps {
  tabId: string;
  currentScore: number | null;
  compact?: boolean;
}

export function ScoreRating({ tabId, currentScore, compact }: ScoreRatingProps) {
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { updateTab } = useTabStore();

  const handleClick = async (score: number) => {
    if (saving) return;
    const newScore = score === currentScore ? 0 : score;
    setSaving(true);
    try {
      if (newScore === 0) {
        await api.tabs.update(tabId, { user_score: null } as any);
        updateTab(tabId, { user_score: null });
      } else {
        await api.export.score(tabId, newScore);
        updateTab(tabId, { user_score: newScore });
      }
    } catch (err) {
      console.error('Failed to save score:', err);
    }
    setSaving(false);
  };

  const displayScore = hoveredScore ?? currentScore ?? 0;
  const maxStars = compact ? 5 : 10;
  const displayMax = compact ? 5 : 10;

  const getScoreLabel = (score: number): string => {
    if (score <= 0) return '';
    if (score <= 2) return '一般';
    if (score <= 4) return '有价值';
    if (score <= 6) return '值得保存';
    if (score <= 8) return '很有价值';
    return '必须保存';
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: displayMax }, (_, i) => i + 1).map(score => {
          const filled = score <= displayScore;
          return (
            <button
              key={score}
              onClick={() => handleClick(score)}
              onMouseEnter={() => setHoveredScore(score)}
              onMouseLeave={() => setHoveredScore(null)}
              disabled={saving}
              className={cn(
                'transition-colors',
                compact ? 'text-xs' : 'text-sm',
                filled ? 'text-amber-500' : 'text-muted-foreground/30',
                'hover:text-amber-400 cursor-pointer disabled:cursor-wait'
              )}
              title={`${score}/${displayMax}`}
            >
              ★
            </button>
          );
        })}
      </div>
      {!compact && displayScore > 0 && (
        <span className="text-[10px] text-muted-foreground ml-1">
          {displayScore}/10 · {getScoreLabel(displayScore)}
        </span>
      )}
    </div>
  );
}
