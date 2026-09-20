'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ErrorState, LoadingState } from '@/components/farmer/async-state';
import { ApiError } from '@/lib/api';
import { AdminTurnover, AdminTurnoverAnalytics, adminApi } from '@/lib/admin-api';
import { TurnoverCharts } from './turnover-charts';

type Counts = { users: number; listings: number; orders: number; shipments: number; disputes: number };

const cards = [
  { field: 'users', key: 'admin.summary.users', href: '/admin/users' },
  { field: 'listings', key: 'admin.summary.activeListings', href: '/admin/listings?status=ACTIVE' },
  { field: 'orders', key: 'admin.summary.orders', href: '/admin/orders' },
  { field: 'shipments', key: 'admin.summary.shipments', href: '/admin/shipments' },
  { field: 'disputes', key: 'admin.summary.disputes', href: '/admin/disputes' },
] as const;

export function AdminDashboard() {
  const { t, number } = useI18n();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [turnover, setTurnover] = useState<AdminTurnover | null>(null);
  const [analytics, setAnalytics] = useState<AdminTurnoverAnalytics | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [users, listings, orders, shipments, disputes, paidTurnover, chartData] = await Promise.all([
        adminApi.users(1, {}, 1), adminApi.listings(1, { status: 'ACTIVE' }, 1),
        adminApi.orders(1, {}, 1), adminApi.shipments(1, {}, 1), adminApi.disputes(1, {}, 1),
        adminApi.turnover(), adminApi.turnoverAnalytics(),
      ]);
      setTurnover(paidTurnover);
      setAnalytics(chartData);
      setCounts({ users: users.pagination.totalItems, listings: listings.pagination.totalItems,
        orders: orders.pagination.totalItems, shipments: shipments.pagination.totalItems,
        disputes: disputes.pagination.totalItems });
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  if ((!counts || !turnover || !analytics) && !error) return <div className="admin-page"><LoadingState /></div>;
  if (!counts || !turnover || !analytics) return <div className="admin-page"><ErrorState message={error} retry={() => void load()} /></div>;
  return <div className="admin-page"><section className="admin-hero"><div><div className="eyebrow">{t('admin.dashboard.eyebrow')}</div><h1>{t('admin.dashboard.title')}</h1><p>{t('admin.dashboard.subtitle')}</p></div><Link className="button button-primary" href="/admin/moderation">{t('admin.dashboard.openModeration')}</Link></section><section className="admin-summary-grid"><Link href="/admin/orders"><span>{t('admin.summary.turnover')}</span><strong>{number(Number(turnover.amount), { maximumFractionDigits: 2 })} UZS</strong><small>{t('admin.summary.turnoverHint', { count: turnover.paidOrders })}</small></Link>{cards.map((card) => <Link href={card.href} key={card.field}><span>{t(card.key)}</span><strong>{number(counts[card.field])}</strong><small>{t('admin.dashboard.openSection')} →</small></Link>)}</section><TurnoverCharts data={analytics} /><section className="admin-operations"><div><h2>{t('admin.dashboard.operationsTitle')}</h2><p>{t('admin.dashboard.operationsBody')}</p></div><div className="admin-operation-links"><Link href="/admin/listings?status=PENDING">{t('admin.dashboard.pendingListings')}</Link><Link href="/admin/disputes?status=OPEN">{t('admin.dashboard.openDisputes')}</Link><Link href="/admin/shipments?status=IN_TRANSIT">{t('admin.dashboard.activeShipments')}</Link></div></section></div>;
}
