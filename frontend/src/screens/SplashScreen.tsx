import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { ready, authenticated } = useAuthStore();

  useEffect(() => {
    if (ready && authenticated) {
      const t = setTimeout(() => navigate('/home'), 700);
      return () => clearTimeout(t);
    }
  }, [ready, authenticated, navigate]);

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 text-center"
      style={{ backgroundColor: '#EAE6D7' }}
    >
      <h1
        className="font-display uppercase"
        style={{ fontSize: 30, letterSpacing: '0.2em', fontWeight: 700, color: '#000000' }}
      >
        Морской&nbsp;Бой
      </h1>
      <p
        className="font-display uppercase"
        style={{ fontSize: 12, letterSpacing: '0.26em', fontWeight: 500, color: '#444444' }}
      >
        Загрузка
      </p>
    </div>
  );
}
