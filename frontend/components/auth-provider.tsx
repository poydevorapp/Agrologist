'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, apiRequest } from '@/lib/api';
import type { AuthSession, LoginInput, RegisterInput } from '@/lib/auth-types';
import { clearSession, readSession, SESSION_CHANGED, writeSession } from '@/lib/session-store';

type AuthContextValue = {
  session: AuthSession | null;
  ready: boolean;
  roles: AuthSession['user']['roles'];
  rolesReady: boolean;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<AuthSession['user']['roles']>([]);
  const [rolesReady, setRolesReady] = useState(false);

  useEffect(() => {
    let active = true;
    const current = readSession();
    setSession(current);
    setReady(true);
    if (current) {
      void apiRequest<{ id: string; roles: AuthSession['user']['roles'] }>('/auth/me')
        .then((user) => {
          if (!active || !Array.isArray(user.roles)) return;
          const latest = readSession();
          if (latest?.user.id !== user.id) return;
          setRoles(user.roles);
          writeSession({ ...latest, user: { ...latest.user, roles: user.roles } });
        })
        .catch(() => { if (active) setRoles([]); })
        .finally(() => { if (active) setRolesReady(true); });
    } else {
      setRolesReady(true);
    }
    const sync = () => setSession(readSession());
    window.addEventListener(SESSION_CHANGED, sync);
    return () => { active = false; window.removeEventListener(SESSION_CHANGED, sync); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    ready,
    roles,
    rolesReady,
    async login(input) {
      const next = await apiRequest<AuthSession>('/auth/login', {
        method: 'POST', body: JSON.stringify(input),
      }, false);
      if (!Array.isArray(next.user?.roles)) throw new ApiError(502, 'Invalid authentication response');
      writeSession(next);
      setSession(next);
      setRoles(next.user.roles);
      setRolesReady(true);
    },
    async register(input) {
      const next = await apiRequest<AuthSession>('/auth/register', {
        method: 'POST', body: JSON.stringify(input),
      }, false);
      if (!Array.isArray(next.user?.roles)) throw new ApiError(502, 'Invalid authentication response');
      writeSession(next);
      setSession(next);
      setRoles(next.user.roles);
      setRolesReady(true);
    },
    async logout() {
      const current = readSession();
      try {
        if (current) await apiRequest<void>('/auth/logout', {
          method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }),
        }, false);
      } finally {
        clearSession();
        setSession(null);
        setRoles([]);
        setRolesReady(true);
      }
    },
  }), [ready, roles, rolesReady, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
