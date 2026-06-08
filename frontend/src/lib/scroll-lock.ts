// Счётчик блокировок скролла страницы. Несколько оверлеев (ConsentGate, Modal и т.п.)
// могут накладываться: пока активна хотя бы одна блокировка — body не скроллится,
// когда закрылись все — скролл гарантированно возвращается. Это убирает баг, когда
// один оверлей захватывал prev='hidden' другого и оставлял страницу залоченной.
let locks = 0;

export function lockScroll(): void {
  locks += 1;
  document.body.style.overflow = 'hidden';
}

export function unlockScroll(): void {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    document.body.style.overflow = '';
  }
}
