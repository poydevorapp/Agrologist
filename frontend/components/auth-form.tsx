'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { readSession } from '@/lib/session-store';
import { useI18n } from './locale-provider';
import { useAuth } from './auth-provider';

type SelfServiceRole = 'FARMER' | 'BUYER' | 'TRANSPORTER';
const registrationRoles: SelfServiceRole[] = ['FARMER', 'BUYER', 'TRANSPORTER'];

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const auth = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState<SelfServiceRole[]>([]);

  function toggleRole(role: SelfServiceRole) {
    setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && roles.length === 0) {
      setError(t('auth.rolesRequired'));
      return;
    }
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      if (mode === 'login') {
        await auth.login({
          identifier: String(data.get('identifier') ?? ''),
          password: String(data.get('password') ?? ''),
        });
      } else {
        const email = String(data.get('email') ?? '').trim();
        await auth.register({
          phone: String(data.get('phone') ?? ''),
          fullName: String(data.get('fullName') ?? ''),
          password: String(data.get('password') ?? ''),
          roles,
          region: String(data.get('region') ?? '').trim(),
          district: String(data.get('district') ?? '').trim(),
          ...(email ? { email } : {}),
        });
      }
      const signedInRoles = readSession()?.user.roles ?? [];
      const primaryRole = isLogin
        ? (['ADMIN', 'FARMER', 'BUYER', 'TRANSPORTER'] as const).find((role) => signedInRoles.includes(role))
        : roles[0];
      router.push(primaryRole ? `/${primaryRole.toLowerCase()}` : '/');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  const isLogin = mode === 'login';
  return (
    <section className="auth-wrap">
      <div className="auth-card">
        <div className="eyebrow">{t('auth.access')}</div>
        <h1>{t(isLogin ? 'auth.welcome' : 'auth.createTitle')}</h1>
        <p>{t(isLogin ? 'auth.loginSubtitle' : 'auth.registerSubtitle')}</p>
        <form method="post" onSubmit={submit} className="form-stack">
          {!isLogin && (
            <>
              <label>{t('auth.fullName')}<input name="fullName" minLength={2} maxLength={120} autoComplete="name" required /></label>
              <label>{t('auth.phone')}<input name="phone" minLength={5} maxLength={32} autoComplete="tel" required /></label>
              <label>{t('auth.email')} <span className="optional">{t('common.optional')}</span><input name="email" type="email" maxLength={254} autoComplete="email" /></label>
              <fieldset className="auth-roles">
                <legend>{t('auth.chooseRoles')}</legend>
                {registrationRoles.map((role) => (
                  <label key={role}>
                    <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
                    {t(`role.${role}`)}
                  </label>
                ))}
              </fieldset>
              <label>{t('auth.region')}{!roles.some((role) => role === 'FARMER' || role === 'BUYER') && <span className="optional">{t('auth.optional')}</span>}
                <input name="region" maxLength={120} required={roles.some((role) => role === 'FARMER' || role === 'BUYER')} />
              </label>
              {roles.some((role) => role === 'FARMER' || role === 'BUYER') &&
                <label>{t('auth.district')}<input name="district" maxLength={120} required /></label>}
            </>
          )}
          {isLogin && <label>{t('auth.identifier')}<input name="identifier" minLength={3} maxLength={254} autoComplete="username" required autoFocus /></label>}
          <label>{t('auth.password')}<input name="password" type="password" minLength={8} maxLength={128} autoComplete={isLogin ? 'current-password' : 'new-password'} required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary button-full" disabled={submitting} type="submit">
            {t(submitting ? 'auth.wait' : isLogin ? 'nav.signIn' : 'nav.register')}
          </button>
        </form>
        <p className="auth-switch">
          {t(isLogin ? 'auth.newUser' : 'auth.alreadyRegistered')}{' '}
          <Link href={isLogin ? '/register' : '/login'}>{t(isLogin ? 'nav.register' : 'nav.signIn')}</Link>
        </p>
      </div>
    </section>
  );
}
