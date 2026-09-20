import type { AuthSession } from './auth-types';

const KEY = 'agrologistik.session';
export const SESSION_CHANGED = 'agrologistik-session-changed';

export function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<AuthSession>;
  return typeof session.accessToken === 'string' && Boolean(session.accessToken) &&
    typeof session.refreshToken === 'string' && Boolean(session.refreshToken) &&
    typeof session.user?.id === 'string' && typeof session.user?.fullName === 'string';
}

export function readSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(KEY);
    const parsed: unknown = value ? JSON.parse(value) : null;
    if (isAuthSession(parsed)) return parsed;
    window.sessionStorage.removeItem(KEY);
    return null;
  } catch {
    return null;
  }
}

export function writeSession(session: AuthSession): void {
  if (!isAuthSession(session)) throw new Error('Invalid authentication response');
  window.sessionStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event(SESSION_CHANGED));
  }
}
