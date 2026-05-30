import { api } from './http';

export const AuthAPI = {
  login: (initData: string) =>
    api.post<{ token: string; user: any; startParam?: string }>('/auth/telegram', { initData })
       .then(r => r.data),
  devLogin: (nickname: string) =>
    api.post<{ token: string; user: any }>('/auth/dev', { nickname })
       .then(r => r.data),
  agreeTerms: () => api.post('/auth/agree-terms', {}).then(r => r.data),
  setNickname: (nickname: string) => api.post('/auth/nickname', { nickname }).then(r => r.data),
};

export const UsersAPI = {
  me: () => api.get('/users/me').then(r => r.data),
  byId: (id: string) => api.get(`/users/${id}`).then(r => r.data),
  setLimits: (p: { dailyDepositLimit?: number; selfExcludeDays?: number }) =>
    api.patch('/users/me/limits', p).then(r => r.data),
  deleteMe: () => api.delete('/users/me').then(r => r.data),
};

export interface Withdrawal {
  id: string;
  amount: number;
  fee: number;
  net: number;
  method: string;
  destination: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
  note?: string | null;
  createdAt: string;
  processedAt?: string | null;
}

export interface DepositResult {
  mode: 'demo' | 'cryptobot';
  credited?: boolean;
  balance?: number;
  payUrl?: string;
  invoiceId?: string;
}

export const WalletAPI = {
  balance: () => api.get<{ balance: number; withdrawable: number }>('/wallet/balance').then(r => r.data),
  txs:     () => api.get('/wallet/transactions').then(r => r.data),
  withdrawals: () => api.get<Withdrawal[]>('/wallet/withdrawals').then(r => r.data),
  deposit: (amount: number) => api.post<DepositResult>('/payments/deposit', { amount }).then(r => r.data),
  withdraw: (amount: number, method: string, destination: string) =>
    api.post('/wallet/withdraw', { amount, method, destination }).then(r => r.data),
};

export interface OpenMatch {
  id: string;
  code: string;
  wagerAmount: number;
  createdAt: string;
  isMine: boolean;
  host: {
    id: string;
    username: string | null;
    firstName: string | null;
    avatar: string | null;
    wins: number;
    losses: number;
  };
}

export const MatchmakingAPI = {
  enqueue: (wagerAmount: number) => api.post('/matchmaking/queue', { wagerAmount }).then(r => r.data),
  leave:   () => api.delete('/matchmaking/queue').then(r => r.data),
  status:  () => api.get('/matchmaking/queue/status').then(r => r.data),
  createLobby: (wagerAmount: number, isPublic = false) =>
    api.post('/matchmaking/lobby', { wagerAmount, isPublic }).then(r => r.data),
  joinLobby:   (code: string) => api.post('/matchmaking/lobby/join', { code }).then(r => r.data),
  getLobby:    (code: string) => api.get(`/matchmaking/lobby/${code}`).then(r => r.data),
  listOpen: (params: { min?: number; max?: number; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.min != null) qs.set('min', String(params.min));
    if (params.max != null) qs.set('max', String(params.max));
    if (params.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return api.get<OpenMatch[]>(`/matchmaking/open${suffix}`).then(r => r.data);
  },
  cancelOpen: () => api.delete('/matchmaking/open').then(r => r.data),
};

export const GameAPI = {
  active: () => api.get('/game/active').then(r => r.data),
  state:  (matchId: string) => api.get(`/game/state/${matchId}`).then(r => r.data),
};

export const HistoryAPI = {
  list: (limit = 50) => api.get(`/history?limit=${limit}`).then(r => r.data),
};

export const LeaderboardAPI = {
  top: (type: 'wins' | 'earnings' = 'wins', limit = 50) =>
    api.get(`/leaderboard?type=${type}&limit=${limit}`).then(r => r.data),
};
