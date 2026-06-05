import * as crypto from 'crypto';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'nc_panel_session';
const TTL_MS = 12 * 60 * 60 * 1000;

export function getAdminPanelPath(): string {
  const raw = (process.env.ADMIN_PANEL_PATH ?? 'harbor-9k2-mnx-panel').trim().replace(/^\/+|\/+$/g, '');
  return raw || 'harbor-9k2-mnx-panel';
}

export function getAdminPanelPathWithSlash(): string {
  return `/${getAdminPanelPath()}`;
}

export function getAdminPanelPublicUrl(): string | null {
  const base = process.env.TELEGRAM_WEBAPP_URL?.replace(/\/+$/, '');
  if (!base) return null;
  return `${base}${getAdminPanelPathWithSlash()}`;
}

const BLOCKED_PUBLIC_PATHS = new Set([
  '/admin.html',
  '/admin-panel.html',
  '/admin-gate.html',
]);

export function isBlockedAdminPublicPath(path: string): boolean {
  return BLOCKED_PUBLIC_PATHS.has(path);
}

function sessionSecret(): string {
  const s = process.env.ADMIN_PANEL_SESSION_SECRET ?? process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error('ADMIN_PANEL_SESSION_SECRET or JWT_SECRET required');
  }
  return s;
}

function signPayload(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createPanelSessionCookie(username: string): string {
  const exp = Date.now() + TTL_MS;
  const body = Buffer.from(JSON.stringify({ u: username, exp }), 'utf8').toString('base64url');
  const sig = signPayload(body);
  return `${body}.${sig}`;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function verifyPanelSessionCookie(req: Request): boolean {
  const raw = readCookie(req, COOKIE_NAME);
  if (!raw) return false;
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return false;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signPayload(body);
  try {
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { u?: string; exp?: number };
    if (!data.u || !data.exp || Date.now() > data.exp) return false;
    const expectedUser = process.env.ADMIN_PANEL_USER?.trim();
    return !expectedUser || data.u === expectedUser;
  } catch {
    return false;
  }
}

export function setPanelSessionCookie(res: Response, username: string) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, createPanelSessionCookie(username), {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: TTL_MS,
    path: '/',
  });
}

export function clearPanelSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function credentialsConfigured(): boolean {
  const user = process.env.ADMIN_PANEL_USER?.trim();
  const pass = process.env.ADMIN_PANEL_PASSWORD ?? '';
  return !!user && pass.length >= 8;
}

export function verifyPanelCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_PANEL_USER?.trim() ?? '';
  const expectedPass = process.env.ADMIN_PANEL_PASSWORD ?? '';
  if (!expectedUser || !expectedPass) return false;
  const userBuf = Buffer.from(username);
  const passBuf = Buffer.from(password);
  const expUserBuf = Buffer.from(expectedUser);
  const expPassBuf = Buffer.from(expectedPass);
  if (userBuf.length !== expUserBuf.length || passBuf.length !== expPassBuf.length) {
    return false;
  }
  return (
    crypto.timingSafeEqual(userBuf, expUserBuf) &&
    crypto.timingSafeEqual(passBuf, expPassBuf)
  );
}
