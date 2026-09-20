'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/locale-provider';
import { useCart } from './cart-provider';

const links = [
  { href: '/buyer', key: 'buyer.nav.marketplace' as const, exact: true },
  { href: '/buyer/search', key: 'buyer.nav.search' as const },
  { href: '/buyer/cart', key: 'buyer.nav.cart' as const },
  { href: '/buyer/orders', key: 'buyer.nav.orders' as const },
  { href: '/buyer/subscriptions', key: 'buyer.nav.subscriptions' as const },
];

export function BuyerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, session } = useAuth();
  const { items } = useCart();
  const { t } = useI18n();
  return <div className="buyer-shell page-container"><nav className="buyer-nav" aria-label={t('buyer.home.eyebrow')}>{links.map((link) => {
    const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
    return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined}>{t(link.key)}{link.href === '/buyer/cart' && items.length > 0 ? <span>{items.length}</span> : null}</Link>;
  })}</nav>{ready && !session ? <div className="notice buyer-auth-notice"><div><strong>{t('common.authenticationRequired')}</strong><span>{t('buyer.authenticationBody')}</span></div><Link className="button button-primary" href="/login">{t('common.signIn')}</Link></div> : children}</div>;
}
