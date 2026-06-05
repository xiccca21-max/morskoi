import { motion } from 'framer-motion';
import { Icon } from '../components/Icon';
import { tgOpenLink } from '../lib/telegram';

export function TelegramAuthError({
  message,
  onRetry,
  build,
}: {
  message: string;
  onRetry: () => void;
  build?: string | null;
}) {
  const bot = import.meta.env.VITE_TG_BOT_USERNAME ?? 'NavalClashBot';

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-7 max-w-md w-full space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-lg bg-danger/10 border border-danger flex items-center justify-center text-danger shrink-0">
            <Icon name="shield" size={20} />
          </span>
          <div>
            <h1 className="title text-lg text-main">Не удалось войти</h1>
            <p className="eyebrow">Telegram Mini App</p>
          </div>
        </div>

        <p className="text-muted text-sm leading-relaxed">{message}</p>

        <div className="space-y-2">
          <button className="btn-primary w-full" onClick={onRetry}>
            Повторить
          </button>
          <button
            className="btn-ghost w-full"
            onClick={() => tgOpenLink(`https://t.me/${bot}`)}
          >
            Открыть бота заново
          </button>
        </div>

        <p className="text-[11px] text-muted leading-relaxed text-center">
          Закройте мини-приложение и нажмите «⚔️ В бой» в боте. Не открывайте сайт напрямую в браузере.
          {build ? <> Версия сервера: <b>{build}</b>.</> : null}
        </p>
      </motion.div>
    </div>
  );
}
