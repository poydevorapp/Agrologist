'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/locale-provider';

const links = [
  { href: '/transporter', key: 'transporter.nav.dashboard' as const, exact: true },
  { href: '/transporter/available', key: 'transporter.nav.available' as const },
  { href: '/transporter/deliveries', key: 'transporter.nav.deliveries' as const },
];

export function TransporterShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, session } = useAuth();
  const { t } = useI18n();
  return <div className="transporter-shell page-container"><nav className="buyer-nav" aria-label={t('transporter.dashboard.eyebrow')}>{links.map((link) => {
    const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
    return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined}>{t(link.key)}</Link>;
  })}</nav>{ready && !session ? <div className="notice buyer-auth-notice"><div><strong>{t('common.authenticationRequired')}</strong><span>{t('transporter.authenticationBody')}</span></div><Link className="button button-primary" href="/login">{t('common.signIn')}</Link></div> : children}</div>;
}
