/** Игровые лимиты — подтягиваются с сервера через useGameConfigStore. */
export { useGameConfigStore, getGameConfig } from '../stores/game-config-store';

import { getGameConfig } from '../stores/game-config-store';

export function getMinWager() {
  return getGameConfig().minWager;
}

export function getMaxWager() {
  return getGameConfig().maxWager;
}
