import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icon } from '../components/Icon';

const STEPS = [
  {
    n: 1,
    icon: 'coins' as const,
    title: 'Выбери ставку',
    body: 'Установи сумму от 1 ₽. Оба игрока ставят одинаковую сумму — она замораживается на балансе в момент старта боя.',
  },
  {
    n: 2,
    icon: 'swords' as const,
    title: 'Найди соперника',
    body: 'Создай открытый бой — он появится в общем списке. Любой игрок с нужным балансом может принять вызов. Или пригласи друга по коду.',
  },
  {
    n: 3,
    icon: 'target' as const,
    title: 'Расставь флот',
    body: 'У тебя 30 секунд расставить 10 кораблей на поле 10×10. Корабли не должны касаться друг друга. Можно использовать авторасстановку.',
  },
  {
    n: 4,
    icon: 'anchor' as const,
    title: 'Бой на море',
    body: 'Игроки ходят по очереди, называя клетку. Попал — стреляешь ещё раз. Промахнулся — ход переходит сопернику. На каждый ход 20 секунд.',
  },
  {
    n: 5,
    icon: 'trophy' as const,
    title: 'Победитель забирает банк',
    body: 'Кто первым потопит все 10 кораблей врага — получает 95% общего банка. 5% — комиссия платформы. Сумма зачисляется мгновенно.',
  },
];

const RANKS = [
  { title: 'Юнга', min: 0 },
  { title: 'Матрос', min: 3 },
  { title: 'Боцман', min: 8 },
  { title: 'Штурман', min: 15 },
  { title: 'Капитан', min: 30 },
  { title: 'Адмирал', min: 60 },
];

export default function HowItWorksScreen() {
  const navigate = useNavigate();
  return (
    <div className="max-w-md mx-auto space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted text-sm">
        <Icon name="arrow-right" size={14} className="rotate-180" /> Назад
      </button>

      <h1 className="title text-main text-xl">Как это работает</h1>

      {/* Шаги */}
      <div className="space-y-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            className="card p-4 flex gap-4"
          >
            <div className="shrink-0 w-10 h-10 rounded-full bg-panel border border-line flex items-center justify-center">
              <Icon name={s.icon} size={18} className="text-danger" />
            </div>
            <div>
              <p className="font-display text-main text-sm">{s.n}. {s.title}</p>
              <p className="text-muted text-xs mt-1 leading-relaxed">{s.body}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Звания */}
      <section className="card p-5">
        <p className="eyebrow mb-3">Звания капитанов</p>
        <div className="space-y-2">
          {RANKS.map((r, i) => (
            <div key={r.title} className="flex items-center justify-between">
              <span className={['font-display text-sm', i === RANKS.length - 1 ? 'text-danger' : 'text-main'].join(' ')}>{r.title}</span>
              <span className="text-muted text-xs">{r.min === 0 ? 'с 0 побед' : `с ${r.min} побед`}</span>
            </div>
          ))}
        </div>
      </section>

      <button className="btn-primary w-full" onClick={() => navigate('/matchmaking')}>
        <Icon name="swords" size={16} /> В бой
      </button>
    </div>
  );
}
