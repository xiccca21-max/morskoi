import { api } from './http';

export const AuthAPI = {
  login: (initData: string) =>
    api.post<{ token: string; user: any; startParam?: string }>('/auth/telegram', { initData })
       .then(r => r.data),
};

export const UsersAPI = {
  me: () => api.get('/users/me').then(r => r.data),
  byId: (id: string) => api.get(`/users/${id}`).then(r => r.data),
};

export const WalletAPI = {
  balance: () => api.get<{ balance: number }>('/wallet/balance').then(r => r.data),
  txs:     () => api.get('/wallet/transactions').then(r => r.data),
  deposit: (amount: number) => api.post('/wallet/deposit', { amount }).then(r => r.data),
  withdraw: (amount: number) => api.post('/wallet/withdraw', { amount }).then(r => r.data),
};

export const MatchmakingAPI = {
  enqueue: (wagerAmount: number) => api.post('/matchmaking/queue', { wagerAmount }).then(r => r.data),
  leave:   () => api.delete('/matchmaking/queue').then(r => r.data),
  status:  () => api.get('/matchmaking/queue/status').then(r => r.data),
  createLobby: (wagerAmount: number) =>
    api.post('/matchmaking/lobby', { wagerAmount }).then(r => r.data),
  joinLobby:   (code: string) => api.post('/matchmaking/lobby/join', { code }).then(r => r.data),
  getLobby:    (code: string) => api.get(`/matchmaking/lobby/${code}`).then(r => r.data),
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
