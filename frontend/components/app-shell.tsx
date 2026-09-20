'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from './auth-provider';
import { useI18n } from './locale-provider';
import { AppLocale, localeNames, supportedLocales } from '@/i18n/messages';

const roleLinks = [
  { href: '/farmer', key: 'nav.farmer' as const, role: 'FARMER' as const },
  { href: '/buyer', key: 'nav.buyer' as const, role: 'BUYER' as const },
  { href: '/transporter', key: 'nav.transporter' as const, role: 'TRANSPORTER' as const },
  { href: '/admin', key: 'nav.admin' as const, role: 'ADMIN' as const },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready, roles, rolesReady, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [logoutError, setLogoutError] = useState(false);

  if (pathname.startsWith('/admin')) return <>{children}</>;

  async function signOut() {
    setLogoutError(false);
    try { await logout(); }
    catch { setLogoutError(true); }
    finally { router.push('/login'); }
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label={t('nav.home')}>
          <span className="brand-mark">A</span>
          <span>Agrologistik</span>
        </Link>
        <nav className="main-nav" aria-label={t('nav.main')}>
          {roleLinks.filter((link) => rolesReady && roles.includes(link.role)).map((link) => (
            <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
              {t(link.key)}
            </Link>
          ))}
          {rolesReady && session && <Link href="/wallet" aria-current={pathname === '/wallet' ? 'page' : undefined}>{t('wallet.nav')}</Link>}
        </nav>
        <div className="account-nav">
          <label className="locale-control">
            <span className="sr-only">{t('nav.language')}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as AppLocale)} aria-label={t('nav.language')}>
              {supportedLocales.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}
            </select>
          </label>
          {!ready ? <span className="muted">{t('nav.loading')}</span> : session ? (
            <>
              <span className="account-name">{session.user.fullName}</span>
              <button className="button button-quiet" type="button" onClick={signOut}>{t('nav.signOut')}</button>
            </>
          ) : (
            <>
              <Link href="/login">{t('nav.signIn')}</Link>
              <Link className="button button-primary" href="/register">{t('nav.register')}</Link>
            </>
          )}
        </div>
      </header>
      {logoutError && <div className="form-error" role="alert">{t('common.errorTitle')}</div>}
      <main>{children}</main>
      <footer className="footer">
        <span>{t('footer.name')}</span>
        <span>{t('footer.tagline')}</span>
      </footer>
    </div>
  );
}
