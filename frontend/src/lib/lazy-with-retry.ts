import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_KEY = 'chunkReloadAt';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

const CHUNK_ERROR_RE =
  /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading CSS chunk/i;

export function isChunkLoadError(err: unknown): boolean {
  const msg =
    (err instanceof Error ? err.message : String(err ?? '')) +
    (typeof (err as { cause?: unknown })?.cause === 'object' && (err as { cause?: Error }).cause?.message
      ? ` ${(err as { cause?: Error }).cause!.message}`
      : '');
  return CHUNK_ERROR_RE.test(msg);
}

function reloadOnceForStaleChunk(): boolean {
  try {
    const now = Date.now();
    const last = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0', 10);
    if (now - last <= CHUNK_RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

async function importWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
): Promise<{ default: T }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await factory();
    } catch (err) {
      lastErr = err;
      if (!isChunkLoadError(err)) throw err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (reloadOnceForStaleChunk()) {
        await new Promise(() => {});
      }
      throw err;
    }
  }
  throw lastErr;
}

/** React.lazy с retry и одноразовым reload при устаревших чанках после деплоя. */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(factory));
}

/** Фоновая подгрузка чанков после входа — без блокировки UI. */
export function prefetchScreens(paths: Array<() => Promise<unknown>>): void {
  for (const load of paths) {
    void load().catch(() => {});
  }
}
