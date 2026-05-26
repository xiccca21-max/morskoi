// Строковые «enum'ы», совместимые с прежним кодом.
// Поскольку SQLite не поддерживает enum, в схеме это просто String,
// а в коде используем эти константы.

export const MatchStatus = {
  PENDING:     'PENDING',
  PLACEMENT:   'PLACEMENT',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED:    'FINISHED',
  CANCELLED:   'CANCELLED',
} as const;
export type MatchStatus = typeof MatchStatus[keyof typeof MatchStatus];

export const GameStatus = {
  PLACEMENT:   'PLACEMENT',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED:    'FINISHED',
} as const;
export type GameStatus = typeof GameStatus[keyof typeof GameStatus];

export const LobbyStatus = {
  OPEN:    'OPEN',
  STARTED: 'STARTED',
  CLOSED:  'CLOSED',
} as const;
export type LobbyStatus = typeof LobbyStatus[keyof typeof LobbyStatus];

export const TxType = {
  DEPOSIT:       'DEPOSIT',
  WITHDRAW:      'WITHDRAW',
  WAGER_LOCK:    'WAGER_LOCK',
  WAGER_REFUND:  'WAGER_REFUND',
  PAYOUT:        'PAYOUT',
  RAKE:          'RAKE',
} as const;
export type TxType = typeof TxType[keyof typeof TxType];

export const TxStatus = {
  PENDING:   'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED:    'FAILED',
  REVERSED:  'REVERSED',
} as const;
export type TxStatus = typeof TxStatus[keyof typeof TxStatus];
