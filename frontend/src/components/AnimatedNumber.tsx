import { useEffect, useRef, useState } from 'react';

export function AnimatedNumber({ value, formatter = (v) => v.toFixed(0) }: { value: number, formatter?: (v: number) => string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === displayValue) return;
    const start = displayValue;
    const end = value;
    const duration = 800;
    let startTime: number | null = null;

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(start + (end - start) * easeProgress);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(end);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return <span>{formatter(displayValue)}</span>;
}
