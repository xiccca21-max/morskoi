import type { OpenMatch } from '../api/endpoints';

let openMatchesCache: OpenMatch[] | null = null;

export function getOpenMatchesCache(): OpenMatch[] | null {
  return openMatchesCache;
}

export function setOpenMatchesCache(list: OpenMatch[] | null): void {
  openMatchesCache = list;
}

export function resetOpenMatchesCache(): void {
  openMatchesCache = null;
}
