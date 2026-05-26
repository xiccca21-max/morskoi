import * as crypto from 'crypto';

/**
 * Валидация Telegram WebApp initData по официальному алгоритму.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface ParsedInitData {
  user: TelegramUser;
  authDate: number;
  hash: string;
  startParam?: string;
}

export function validateAndParseInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 3600 * 24,
): ParsedInitData {
  if (!initData) throw new Error('initData is empty');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('hash is missing');

  params.delete('hash');

  // data_check_string — отсортированные ключи "key=value", разделённые \n
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const checkHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (checkHash !== hash) throw new Error('initData hash mismatch');

  const authDate = Number(params.get('auth_date') ?? '0');
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) {
    throw new Error('initData expired');
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new Error('user missing');
  const user = JSON.parse(userRaw) as TelegramUser;

  return {
    user,
    authDate,
    hash,
    startParam: params.get('start_param') ?? undefined,
  };
}
