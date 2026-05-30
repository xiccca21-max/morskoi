/** Единый спиннер загрузки. size — диаметр в px. */
export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Загрузка"
      className={`inline-block rounded-full border-2 border-muted/40 border-t-danger animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Центрированный спиннер для пустых областей. */
export function SpinnerBlock({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex justify-center py-10 ${className}`}>
      <Spinner size={size} />
    </div>
  );
}
