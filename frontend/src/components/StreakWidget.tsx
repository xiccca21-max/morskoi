import { Icon } from './Icon';

/** Ежедневный стрик входа и прогресс бонуса. */
export function StreakWidget({ streak }: { streak: number }) {
  const days = Math.min(Math.max(streak, 0), 7);
  const nextBonus = 10 + Math.min(days, 6) * 5;
  const pct = streak > 0 ? Math.round((days / 7) * 100) : 0;

  return (
    <div className="plate px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon name="coins" size={16} className="text-danger shrink-0" />
        <span className="text-main flex-1">
          {streak > 0 ? (
            <>Стрик входа: <span className="font-display tabular-nums">{streak}</span> дн.</>
          ) : (
            <>Ежедневный бонус: заходи каждый день</>
          )}
        </span>
        <span className="text-muted text-xs">+{nextBonus} ₽ завтра</span>
      </div>
      <div className="h-1 rounded-full bg-panel overflow-hidden">
        <div className="h-full bg-danger transition-all" style={{ width: `${pct || 8}%` }} />
      </div>
      <p className="text-[10px] text-muted">7 дней подряд — максимум 40 ₽/день (бонус невыводимый)</p>
    </div>
  );
}
