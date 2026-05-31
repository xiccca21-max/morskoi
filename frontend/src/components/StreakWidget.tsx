import { Icon } from './Icon';

/** Серия входов — прогресс к достижениям, без денежных бонусов. */
export function StreakWidget({ streak }: { streak: number }) {
  const goal = 7;
  const pct = streak > 0 ? Math.min(100, Math.round((streak / goal) * 100)) : 0;

  return (
    <div className="plate px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon name="anchor" size={16} className="text-danger shrink-0" />
        <span className="text-main flex-1">
          {streak > 0 ? (
            <>Стрик входа: <span className="font-display tabular-nums">{streak}</span> дн.</>
          ) : (
            <>Заходи каждый день — открывай достижения</>
          )}
        </span>
        {streak > 0 && streak < goal && (
          <span className="text-muted text-xs tabular-nums">до {goal} дн.</span>
        )}
        {streak >= goal && (
          <span className="text-muted text-xs">макс.</span>
        )}
      </div>
      <div className="h-1 rounded-full bg-panel overflow-hidden">
        <div className="h-full bg-danger transition-all" style={{ width: `${pct || 8}%` }} />
      </div>
      <p className="text-[10px] text-muted">
        3 и 7 дней подряд — значки «На вахте» и «Верный капитан»
      </p>
    </div>
  );
}
