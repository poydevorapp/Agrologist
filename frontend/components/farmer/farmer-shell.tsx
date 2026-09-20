'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/locale-provider';

const links = [
  { href: '/farmer', key: 'farmer.nav.dashboard' as const, exact: true },
  { href: '/farmer/listings', key: 'farmer.nav.listings' as const },
  { href: '/farmer/listings/new', key: 'farmer.nav.create' as const, exact: true },
  { href: '/farmer/orders', key: 'farmer.nav.orders' as const },
];

export function FarmerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, session } = useAuth();
  const { t } = useI18n();
  return (
    <div className="farmer-shell page-container">
      <nav className="farmer-nav" aria-label={t('farmer.dashboard.eyebrow')}>
        {links.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined}>{t(link.key)}</Link>;
        })}
      </nav>
      {ready && !session ? (
        <div className="notice farmer-auth-notice">
          <div><strong>{t('common.authenticationRequired')}</strong><span>{t('common.authenticationBody')}</span></div>
          <Link className="button button-primary" href="/login">{t('common.signIn')}</Link>
        </div>
      ) : children}
    </div>
  );
}
