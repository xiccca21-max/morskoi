/** Поддерживаемые сети USDT для вывода. */
export const USDT_NETWORKS = {
  TRC20: {
    label: 'TRC20 (Tron)',
    hint: 'Адрес начинается с T, 34 символа',
    pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  },
  ERC20: {
    label: 'ERC20 (Ethereum)',
    hint: 'Адрес 0x + 40 hex-символов',
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  BEP20: {
    label: 'BEP20 (BNB Chain)',
    hint: 'Адрес 0x + 40 hex-символов',
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
  TON: {
    label: 'TON',
    hint: 'Адрес TON-кошелька (EQ/UQ…)',
    pattern: /^[EUQ][A-Za-z0-9_-]{46,}$/,
  },
  ARB: {
    label: 'Arbitrum',
    hint: 'Адрес 0x + 40 hex-символов',
    pattern: /^0x[a-fA-F0-9]{40}$/,
  },
} as const;

export type UsdtNetwork = keyof typeof USDT_NETWORKS;

export const USDT_NETWORK_IDS = Object.keys(USDT_NETWORKS) as UsdtNetwork[];

export function methodForNetwork(network: UsdtNetwork): string {
  return `USDT_${network}`;
}

export function parseWithdrawMethod(method: string): { asset: string; network?: string } {
  if (method.startsWith('USDT_')) {
    return { asset: 'USDT', network: method.slice(5) };
  }
  if (method === 'CRYPTO') return { asset: 'USDT', network: 'legacy' };
  if (method === 'TON') return { asset: 'TON' };
  return { asset: method };
}

export function validateUsdtAddress(network: string, address: string): void {
  const cfg = USDT_NETWORKS[network as UsdtNetwork];
  if (!cfg) throw new Error('Неподдерживаемая сеть');
  const clean = address.trim();
  if (!cfg.pattern.test(clean)) {
    throw new Error(`Некорректный адрес для ${cfg.label}. ${cfg.hint}`);
  }
}
