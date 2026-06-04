import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { CosmeticsAPI, type CosmeticsProfile } from '../api/endpoints';
import { tgHaptic } from '../lib/telegram';
import { toast } from '../stores/toast-store';
import { Icon } from '../components/Icon';

const TYPE_LABEL: Record<string, string> = { title: 'Титулы', frame: 'Рамки', skin: 'Скины кораблей', badge: 'Бейджи' };

export default function CosmeticsScreen() {
  const navigate = useNavigate();
  const patchUser = useAuthStore((s) => s.patchUser);
  const [profile, setProfile] = useState<CosmeticsProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    CosmeticsAPI.profile().then(setProfile).catch(() => undefined);
  }, []);

  const equip = async (type: 'title' | 'frame' | 'skin', id: string) => {
    setBusy(id);
    try {
      const next = await CosmeticsAPI.equip(type, id);
      setProfile(next);
      patchUser({ equippedTitle: next.equipped.title, equippedFrame: next.equipped.frame, equippedSkin: next.equipped.skin });
      tgHaptic('success');
      toast('Применено', 'success', 'check');
    } catch (e: any) {
      tgHaptic('error');
      toast(e?.response?.data?.message ?? 'Не удалось применить', 'error');
    } finally { setBusy(null); }
  };

  const groups: Array<'title' | 'frame' | 'skin'> = ['title', 'frame', 'skin'];

  return (
    <div className="max-w-md mx-auto space-y-4">
      <button
        type="button"
        onClick={() => navigate('/profile')}
        className="flex items-center gap-2 text-muted active:opacity-70"
      >
        <Icon name="arrow-right" size={16} className="rotate-180" />
        <span className="text-sm">Назад</span>
      </button>

      {!profile ? (
        <div className="flex items-center justify-center gap-2 text-muted text-xs py-10">
          <span className="w-3 h-3 rounded-full border-2 border-transparent border-t-danger animate-spin" />
          Загрузка…
        </div>
      ) : (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <p className="eyebrow">Косметика</p>
            <span className="text-muted text-[11px]">Не влияет на баланс</span>
          </div>

          {groups.map((g, gi) => {
            const items = profile.items.filter((i) => i.type === g);
            if (!items.length) return null;
            return (
              <div key={g} className={gi > 0 ? 'border-t border-line' : ''}>
                <div className="px-4 pt-3 pb-1">
                  <p className="eyebrow">{TYPE_LABEL[g]}</p>
                </div>
                <ul className="divide-y divide-line">
                  {items.map((it) => {
                    const equipped = profile.equipped[g] === it.id;
                    return (
                      <li key={it.id}>
                        <button
                          disabled={!it.unlocked || busy !== null}
                          onClick={() => equip(g, it.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 transition active:opacity-70"
                        >
                          <div className={[
                            'w-7 h-7 rounded-md flex items-center justify-center shrink-0 border',
                            equipped ? 'bg-danger border-danger' : 'bg-panel border-line',
                          ].join(' ')}>
                            {equipped
                              ? <Icon name="check" size={13} className="text-white" />
                              : <Icon name={it.unlocked ? 'check' : 'lock'} size={13} className="text-muted" />}
                          </div>
                          <div className="flex-1 text-left">
                            <p className={['text-sm', equipped ? 'text-main font-display' : it.unlocked ? 'text-main' : 'text-muted'].join(' ')}>
                              {it.name}
                            </p>
                            {!it.unlocked && <p className="text-[11px] text-muted">{it.desc}</p>}
                          </div>
                          {equipped && <span className="text-[10px] text-danger font-display uppercase tracking-wide">Активно</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
