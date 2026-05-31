import { useCallback, useEffect, useRef, useState } from 'react';

/** Pull-to-refresh для списков (touch, когда scrollY ≈ 0). */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 4) return;
      startY.current = e.touches[0]?.clientY ?? 0;
      pulling.current = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy < 0) pulling.current = false;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!pulling.current) return;
      pulling.current = false;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - startY.current;
      if (dy > 72 && window.scrollY <= 4) refresh();
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [refresh]);

  return { refreshing, refresh };
}
