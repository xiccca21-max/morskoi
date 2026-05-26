import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';
import { tgHaptic } from '../lib/telegram';

export default function HomeScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="max-w-md mx-auto space-y-5">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="card p-6 relative overflow-hidden"
      >
        <div
          className="absolute -right-10 -top-10 w-48 h-48 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.5), transparent 60%)' }}
        />
        <p className="text-white/60 text-sm">С возвращением, капитан</p>
        <h2 className="font-display text-2xl mt-1">{user?.firstName ?? user?.username ?? 'Командующий'}</h2>

        <div className="grid grid-cols-3 gap-2 mt-5 text-center">
          <Stat label="Победы" value={user?.wins ?? 0} accent="text-sonar-400" />
          <Stat label="Поражения" value={user?.losses ?? 0} accent="text-cyber-red" />
          <Stat label="Баланс" value={`$${user?.balance?.toFixed(2) ?? '0.00'}`} accent="text-cyber-cyan" />
        </div>
      </motion.section>

      {/* Actions */}
      <section className="grid grid-cols-1 gap-3">
        <button
          className="card p-5 text-left hover:bg-cyber-cyan/5 transition relative"
          onClick={() => { tgHaptic('medium'); navigate('/matchmaking'); }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyber-cyan/15 flex items-center justify-center text-2xl shadow-glow">⚔</div>
            <div className="flex-1">
              <h3 className="font-semibold">Быстрая игра</h3>
              <p className="text-white/50 text-sm">PvP матч с реальной ставкой</p>
            </div>
            <span className="text-cyber-cyan">→</span>
          </div>
        </button>

        <button
          className="card p-5 text-left hover:bg-cyber-cyan/5 transition"
          onClick={() => navigate('/wallet')}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-sonar-500/15 flex items-center justify-center text-2xl">💰</div>
            <div className="flex-1">
              <h3 className="font-semibold">Кошелёк</h3>
              <p className="text-white/50 text-sm">Пополнить / вывести</p>
            </div>
            <span className="text-cyber-cyan">→</span>
          </div>
        </button>

        <button
          className="card p-5 text-left hover:bg-cyber-cyan/5 transition"
          onClick={() => navigate('/leaderboard')}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyber-gold/15 flex items-center justify-center text-2xl">🏆</div>
            <div className="flex-1">
              <h3 className="font-semibold">Лидерборд</h3>
              <p className="text-white/50 text-sm">Лучшие капитаны планеты</p>
            </div>
            <span className="text-cyber-cyan">→</span>
          </div>
        </button>
      </section>

      <section className="card p-5">
        <h3 className="font-display text-cyber-cyan text-sm tracking-widest mb-2">КАК ЭТО РАБОТАЕТ</h3>
        <ul className="text-sm text-white/70 space-y-1.5">
          <li>• Выбери ставку и найди соперника</li>
          <li>• Оба депонируют одинаковую сумму</li>
          <li>• Победитель забирает 95% призового фонда</li>
          <li>• 5% — комиссия платформы (rake)</li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent: string }) {
  return (
    <div className="rounded-xl bg-navy-800/60 p-3">
      <div className={`font-display text-lg ${accent}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}
