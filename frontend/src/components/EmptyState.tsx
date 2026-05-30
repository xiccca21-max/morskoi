import type { ReactNode } from 'react';
import { Icon, IconName } from './Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

/** Единое пустое состояние: иконка в круге + заголовок + подсказка + опц. действие. */
export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="card p-8 flex flex-col items-center gap-3 text-center">
      <span className="w-16 h-16 rounded-full bg-danger/10 border border-danger/40 flex items-center justify-center text-danger">
        <Icon name={icon} size={28} />
      </span>
      <p className="text-main text-sm font-display">{title}</p>
      {subtitle && <p className="text-muted text-xs max-w-[240px]">{subtitle}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
