import { useState } from 'react';
import { motion } from 'framer-motion';
import { AuthAPI } from '../api/endpoints';
import { setAuthToken } from '../api/http';
import { useAuthStore } from '../stores/auth-store';
import { Icon } from '../components/Icon';

export default function DevLoginScreen() {
  const setUser = useAuthStore((s) => s.setUser);
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (name?: string) => {
    const clean = (name ?? nickname).trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await AuthAPI.devLogin(clean);
      setAuthToken(token);
      setUser({ ...user, balance: Number(user.balance) });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-7 max-w-md w-full"
      >
        <div className="flex items-center gap-3 mb-5">
          <span className="w-10 h-10 rounded-lg bg-panel border border-line flex items-center justify-center text-main">
            <Icon name="anchor" size={20} />
          </span>
          <div>
            <h1 className="title text-lg text-main">Вход</h1>
            <p className="eyebrow">Тестовый режим без Telegram</p>
          </div>
        </div>

        <p className="text-muted text-sm mb-5 leading-relaxed">
          Откройте страницу в <span className="text-main">двух браузерах</span> (или обычный + инкогнито)
          под разными именами — и сыграйте настоящую дуэль.
        </p>

        <p className="eyebrow mb-2">Имя капитана</p>
        <input
          autoFocus
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Например, Флинт"
          maxLength={24}
          className="w-full bg-panel border border-line rounded-lg px-4 py-3 text-main outline-none focus:border-line transition"
        />

        {error && <p className="text-danger text-sm mt-3">{error}</p>}

        <button onClick={() => submit()} disabled={loading || !nickname.trim()} className="btn-primary w-full mt-5">
          {loading ? 'Вход…' : 'Войти'}
        </button>

        <div className="mt-6 pt-5 border-t border-line">
          <p className="eyebrow mb-3">Быстрый вход</p>
          <div className="flex gap-2">
            <button onClick={() => submit('Флинт')} className="btn-secondary flex-1">Флинт</button>
            <button onClick={() => submit('Дрейк')} className="btn-secondary flex-1">Дрейк</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
