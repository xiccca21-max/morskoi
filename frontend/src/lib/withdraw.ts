/** Сети USDT для вывода (синхронно с backend). */
export const USDT_NETWORKS = [
  { id: 'TRC20', label: 'TRC20', sub: 'Tron', hint: 'Адрес начинается с T' },
  { id: 'ERC20', label: 'ERC20', sub: 'Ethereum', hint: '0x + 40 символов' },
  { id: 'BEP20', label: 'BEP20', sub: 'BNB Chain', hint: '0x + 40 символов' },
  { id: 'TON', label: 'TON', sub: 'The Open Network', hint: 'EQ / UQ…' },
  { id: 'ARB', label: 'Arbitrum', sub: 'Layer 2', hint: '0x + 40 символов' },
] as const;

export type UsdtNetworkId = (typeof USDT_NETWORKS)[number]['id'];

export const MIN_WITHDRAW = 100;

const PATTERNS: Record<UsdtNetworkId, RegExp> = {
  TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ERC20: /^0x[a-fA-F0-9]{40}$/,
  BEP20: /^0x[a-fA-F0-9]{40}$/,
  TON: /^[EUQ][A-Za-z0-9_-]{46,}$/,
  ARB: /^0x[a-fA-F0-9]{40}$/,
};

export function validateUsdtAddress(network: UsdtNetworkId, address: string): string | null {
  const clean = address.trim();
  if (clean.length < 10) return 'Введите адрес кошелька';
  if (!PATTERNS[network]?.test(clean)) {
    const net = USDT_NETWORKS.find((n) => n.id === network);
    return net ? `Некорректный адрес (${net.hint})` : 'Некорректный адрес';
  }
  return null;
}

export function formatWithdrawMethod(method: string): string {
  if (method.startsWith('USDT_')) return `USDT · ${method.slice(5)}`;
  if (method === 'CRYPTO') return 'USDT';
  if (method === 'TON') return 'TON (legacy)';
  return method;
}

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
