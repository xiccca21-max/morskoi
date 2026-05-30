import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'danger' | 'warning';

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted/15 text-muted',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-display uppercase tracking-wide ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Бейдж по статусу заявки на вывод. */
export function WithdrawStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    PENDING: { tone: 'warning', label: 'В обработке' },
    APPROVED: { tone: 'success', label: 'Одобрено' },
    PAID: { tone: 'success', label: 'Выплачено' },
    REJECTED: { tone: 'danger', label: 'Отклонено' },
  };
  const s = map[status] ?? { tone: 'neutral' as Tone, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
