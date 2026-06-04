import { motion } from 'framer-motion';
import { useSettingsStore } from '../stores/settings-store';
import { tgHaptic } from '../lib/telegram';
import { playSound } from '../lib/audio';

/**
 * Кнопка звука в шапке. Включён — обычный динамик со звуковыми волнами.
 * Выключен — волны плавно гаснут, и поверх иконки прорисовывается красная
 * перечёркивающая линия (анимация draw через pathLength).
 */
export function SoundToggle() {
  const sound = useSettingsStore((s) => s.sound);
  const setSound = useSettingsStore((s) => s.setSound);
  const muted = !sound;

  const toggle = () => {
    const next = !sound;
    setSound(next);
    tgHaptic('light');
    if (next) playSound('click');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? 'Включить звук' : 'Выключить звук'}
      aria-pressed={muted}
      className="flex items-center justify-center w-9 h-9 rounded-xl text-main shrink-0 active:scale-90 transition"
      style={{
        background: 'rgba(var(--c-panel-rgb) / 0.8)',
        border: '1px solid rgba(var(--c-line-rgb) / 0.6)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M11 5 6 9H3v6h3l5 4Z" />
        <motion.g
          initial={false}
          animate={{ opacity: muted ? 0 : 1 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
        >
          <path d="M15 9.5a4 4 0 0 1 0 5" />
          <path d="M17.6 7a7.5 7.5 0 0 1 0 10" />
        </motion.g>
        <motion.line
          x1="3.5"
          y1="3.5"
          x2="20.5"
          y2="20.5"
          stroke="var(--c-danger)"
          strokeWidth={2}
          initial={false}
          animate={{ pathLength: muted ? 1 : 0, opacity: muted ? 1 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        />
      </svg>
    </button>
  );
}
