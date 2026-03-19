import { useState } from 'react';
import { useTabStore } from '../stores/tab-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface ScoreRatingProps {
  tabId: string;
  currentScore: number | null;
  compact?: boolean;
}

export function ScoreRating({ tabId, currentScore, compact }: ScoreRatingProps) {
  const { t } = useT();
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);
  const { updateTab } = useTabStore();

  const handleClick = (score: number) => {
    const newScore = score === currentScore ? 0 : score;
    updateTab(tabId, { user_score: newScore || null });
  };

  const displayScore = hoveredScore ?? currentScore ?? 0;
  const displayMax = compact ? 5 : 10;

  const getScoreLabel = (score: number): string => {
    if (score <= 0) return '';
    if (score <= 2) return t('score.normal');
    if (score <= 4) return t('score.valuable');
    if (score <= 6) return t('score.worthSaving');
    if (score <= 8) return t('score.veryValuable');
    return t('score.mustSave');
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
              className={cn(
                'transition-colors',
                compact ? 'text-xs' : 'text-sm',
                filled ? 'text-amber-500' : 'text-muted-foreground/30',
                'hover:text-amber-400 cursor-pointer'
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
