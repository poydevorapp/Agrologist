'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/locale-provider';
import { AppLocale, localeNames, supportedLocales } from '@/i18n/messages';

const links = [
  { href: '/admin', key: 'admin.nav.overview' as const, exact: true },
  { href: '/admin/users', key: 'admin.nav.users' as const },
  { href: '/admin/wallet', key: 'admin.nav.wallet' as const },
  { href: '/admin/listings', key: 'admin.nav.listings' as const },
  { href: '/admin/orders', key: 'admin.nav.orders' as const },
  { href: '/admin/shipments', key: 'admin.nav.shipments' as const },
  { href: '/admin/disputes', key: 'admin.nav.disputes' as const },
  { href: '/admin/moderation', key: 'admin.nav.moderation' as const },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, rolesReady, roles, session, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [logoutError, setLogoutError] = useState(false);
  const allowed = rolesReady && roles.includes('ADMIN') && Boolean(session);

  useEffect(() => {
    if (ready && rolesReady && !allowed) router.replace('/');
  }, [allowed, ready, rolesReady, router]);

  async function signOut() {
    setLogoutError(false);
    try { await logout(); }
    catch { setLogoutError(true); }
    finally { router.replace('/login'); }
  }

  if (!ready || !rolesReady) return <div className="admin-gate" role="status">{t('nav.loading')}</div>;
  if (!allowed) return null;

  return <div className="admin-workspace">
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/admin" aria-label={t('admin.nav.overview')}>
        <span className="admin-brand-mark">A</span>
        <span>Agrologistik<small>{t('admin.dashboard.eyebrow')}</small></span>
      </Link>
      <nav className="admin-nav" aria-label={t('admin.nav.label')}>{links.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return <Link href={link.href} key={link.href} aria-current={active ? 'page' : undefined}>{t(link.key)}</Link>;
      })}</nav>
      <div className="admin-sidebar-footer">
        <span className="admin-account-name">{session?.user.fullName}</span>
        <label className="admin-language"><span className="sr-only">{t('nav.language')}</span>
          <select value={locale} onChange={(event) => setLocale(event.target.value as AppLocale)} aria-label={t('nav.language')}>
            {supportedLocales.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void signOut()}>{t('nav.signOut')}</button>
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar"><span>{t('admin.nav.label')}</span><Link href="/">{t('nav.home')} ↗</Link></header>
      {logoutError && <div className="form-error" role="alert">{t('common.errorTitle')}</div>}
      <main className="admin-content">{children}</main>
    </div>
  </div>;
}
