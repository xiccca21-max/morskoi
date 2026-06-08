/** Версия клиента, с которой собран бандл (git SHA). */
export const CLIENT_BUILD = (import.meta.env.VITE_BUILD_SHA as string | undefined)?.trim() || null;

export function parseBuildFromMeta(): string | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('meta[name="nc-build"]')?.getAttribute('content')?.trim() || null;
}

export function resolveClientBuild(): string | null {
  return CLIENT_BUILD || parseBuildFromMeta();
}

export function shouldReloadForBuild(
  serverBuild: string | null | undefined,
  clientBuild?: string | null,
): boolean {
  const client = (clientBuild ?? resolveClientBuild())?.trim();
  const server = serverBuild?.trim();
  if (!server || !client || client === 'dev' || client === 'unknown') return false;
  return server !== client;
}

const RELOAD_KEY = 'nc_reloaded_for_build';
const RELOAD_RETRY_MS = 60_000;

/** Жёсткая перезагрузка с cache-bust — обычный reload в Telegram WebView часто не сбрасывает кэш. */
export function hardReloadForBuild(serverBuild: string): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    const now = Date.now();
    if (raw) {
      const prev = JSON.parse(raw) as { build?: string; at?: number };
      if (prev.build === serverBuild && typeof prev.at === 'number' && now - prev.at < RELOAD_RETRY_MS) {
        return false;
      }
    }
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ build: serverBuild, at: now }));
  } catch {
    /* приватный режим — всё равно пробуем */
  }

  const done = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('ncb', serverBuild);
    url.searchParams.set('_', String(Date.now()));
    window.location.replace(url.toString());
  };

  if (typeof caches !== 'undefined') {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(done, done);
  } else {
    done();
  }
  return true;
}

export async function fetchServerBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/api/config?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: string | null };
    return data.build?.trim() || null;
  } catch {
    return null;
  }
}

export async function ensureFreshClient(): Promise<void> {
  const serverBuild = await fetchServerBuild();
  if (shouldReloadForBuild(serverBuild)) {
    hardReloadForBuild(serverBuild!);
  }
}
