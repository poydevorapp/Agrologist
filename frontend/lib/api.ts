import type { AuthSession } from './auth-types';
import { clearSession, isAuthSession, readSession, writeSession } from './session-store';
import { AppLocale, message, supportedLocales } from '../i18n/messages';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || '/api/backend').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly originalMessage: string) {
    super(displayError(status, originalMessage));
  }
}

function displayError(status: number, original: string): string {
  // Retain the precise backend message for diagnostics, but never display an
  // untranslated backend error to a browser user.
  if (typeof window === 'undefined') return original;
  let locale: AppLocale = 'uz-UZ';
  try {
    const stored = window.localStorage.getItem('agrologistik.locale');
    if (supportedLocales.includes(stored as AppLocale)) locale = stored as AppLocale;
    else locale = supportedLocales.find((item) => item.split('-')[0] === window.navigator.language.split('-')[0]) ?? locale;
  } catch { /* Private browsing can deny storage; use the app's default locale. */ }
  const key = status === 400 ? 'common.invalidInput'
    : status === 401 ? 'common.authenticationRequired'
    : status === 403 ? 'common.forbidden'
    : status === 404 ? 'common.notFound'
    : status === 409 ? 'common.conflict'
    : status === 429 ? 'common.rateLimit'
    : status >= 500 ? 'common.serverUnavailable'
    : 'common.errorTitle';
  return message(locale, key);
}

function errorMessage(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'The request could not be completed.';
}

async function decode<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new ApiError(response.status, errorMessage(payload));
  if (!payload || typeof payload !== 'object') throw new ApiError(502, 'Invalid response from the server. Please retry.');
  return payload as T;
}

async function request(url: string, init: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(30000);
  return fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}

async function rotateSession(refreshToken: string): Promise<AuthSession | null> {
  const response = await request(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (response.status === 401 || response.status === 403) {
    if (readSession()?.refreshToken === refreshToken) clearSession();
    return null;
  }
  const session = await decode<AuthSession>(response);
  if (!isAuthSession(session)) throw new ApiError(502, 'Invalid authentication response. Please sign in again.');
  if (readSession()?.refreshToken !== refreshToken) return null;
  writeSession(session);
  return session;
}

const refreshes = new Map<string, Promise<AuthSession | null>>();

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const session = authenticated ? readSession() : null;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);

  let response = await request(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401 && authenticated && session?.refreshToken) {
    const current = readSession();
    // Do not replay an old account's request under a different login.
    if (!current || current.user.id !== session.user.id) return decode<T>(response);
    let rotated = current;
    if (current.refreshToken === session.refreshToken) {
      let pending = refreshes.get(session.refreshToken);
      if (!pending) {
        pending = rotateSession(session.refreshToken).finally(() => { refreshes.delete(session.refreshToken); });
        refreshes.set(session.refreshToken, pending);
      }
      const result = await pending;
      if (!result) return decode<T>(response);
      rotated = result;
    }
    if (readSession()?.refreshToken === rotated.refreshToken) {
      headers.set('Authorization', `Bearer ${rotated.accessToken}`);
      response = await request(`${API_BASE_URL}${path}`, { ...init, headers });
    }
  }
  return decode<T>(response);
}
