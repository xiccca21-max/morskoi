import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { formatMoney } from '../lib/format';

interface Props {
  open: boolean;
  wager?: number;
  meName?: string;
  meAvatar?: string | null;
  oppName?: string;
  oppAvatar?: string | null;
}

export function MatchFoundOverlay({ open, wager, meName, meAvatar, oppName, oppAvatar }: Props) {
  const hasDuel = !!(meName || oppName);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-base/95 backdrop-blur-md overflow-hidden"
        >
          {/* Глубинный фон */}
          <div className="absolute inset-0 sea-bg opacity-30" />

          {/* Расходящиеся боевые лучи */}
          <motion.div
            className="absolute w-[140vmax] h-[140vmax] pointer-events-none opacity-[0.07]"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, rgba(232,50,40,0.9) 0deg 4deg, transparent 4deg 14deg)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          />

          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className="relative text-center px-6 w-full max-w-sm"
          >
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="eyebrow text-danger mb-6"
            >
              Соперник найден
            </motion.p>

            {hasDuel ? (
              <div className="flex items-center justify-center gap-3 mb-6">
                {/* Я — слева, прилёт слева */}
                <DuelSide name={meName} avatar={meAvatar} from="left" accent="rgb(var(--c-success-rgb))" />

                {/* Центр: VS со скрещёнными мечами */}
                <motion.div
                  initial={{ scale: 0, rotate: -30, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 14 }}
                  className="relative shrink-0 flex flex-col items-center"
                >
                  <motion.div
                    animate={{ scale: [1, 1.12, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }}
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{
                      background: 'radial-gradient(circle at 50% 35%, rgba(232,50,40,0.3), rgba(232,50,40,0.08))',
                      border: '2px solid rgb(var(--c-danger-rgb))',
                      boxShadow: '0 0 28px rgba(232,50,40,0.45)',
                    }}
                  >
                    <Icon name="swords" size={22} className="text-danger" />
                  </motion.div>
                  <span className="font-display text-danger text-xs tracking-[0.2em] mt-1">VS</span>
                </motion.div>

                {/* Соперник — справа, прилёт справа */}
                <DuelSide name={oppName} avatar={oppAvatar} from="right" accent="rgb(var(--c-danger-rgb))" />
              </div>
            ) : (
              <div className="relative mx-auto w-28 h-28 mb-6 flex items-center justify-center">
                {[0, 0.5, 1].map((d) => (
                  <motion.span
                    key={d}
                    className="absolute rounded-full border-2 border-danger/50"
                    style={{ width: 88, height: 88 }}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 2.4, opacity: [0.6, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: d }}
                  />
                ))}
                <motion.div
                  animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }}
                  className="relative w-24 h-24 rounded-full flex items-center justify-center"
                  style={{
                    background: 'radial-gradient(circle at 50% 35%, rgba(232,50,40,0.28), rgba(232,50,40,0.08))',
                    border: '4px solid rgb(var(--c-danger-rgb))',
                    boxShadow: '0 0 40px rgba(232,50,40,0.4), inset 0 0 24px rgba(232,50,40,0.2)',
                  }}
                >
                  <Icon name="swords" size={44} className="text-danger" />
                </motion.div>
              </div>
            )}

            {wager != null && wager > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 18 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full"
                style={{
                  background: 'rgba(212,168,44,0.12)',
                  border: '1px solid rgba(212,168,44,0.4)',
                }}
              >
                <Icon name="coins" size={14} className="text-warning" />
                <span className="font-display text-sm text-main tnum">Ставка {formatMoney(wager)}</span>
              </motion.div>
            )}
            {wager === 0 && <p className="text-muted text-sm">Тренировка · без ставки</p>}

            <p className="text-muted text-xs mt-5 tracking-[0.2em] uppercase animate-pulse">
              Расставляем флот…
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DuelSide({
  name,
  avatar,
  from,
  accent,
}: {
  name?: string;
  avatar?: string | null;
  from: 'left' | 'right';
  accent: string;
}) {
  return (
    <motion.div
      initial={{ x: from === 'left' ? -60 : 60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 20 }}
      className="flex-1 min-w-0 flex flex-col items-center gap-2"
    >
      <div
        className="rounded-full p-[3px]"
        style={{ background: `radial-gradient(circle, ${accent}, transparent 72%)`, boxShadow: `0 0 24px ${accent}55` }}
      >
        <Avatar name={name} src={avatar ?? undefined} size={64} />
      </div>
      <span className="font-display text-sm text-main truncate max-w-full px-1">{name || 'Капитан'}</span>
    </motion.div>
  );
}
