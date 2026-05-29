export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line/30 ${className}`} />;
}

/** Заглушка строки списка (история / рейтинг). */
export function SkeletonRow() {
  return (
    <div className="card p-4 flex items-center gap-3">
      <Skeleton className="w-9 h-9 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
      <Skeleton className="h-4 w-12" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
