import { useEffect, useState } from 'react';

/** Возвращает значение с задержкой — чтобы не дёргать API на каждый символ. */
export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
