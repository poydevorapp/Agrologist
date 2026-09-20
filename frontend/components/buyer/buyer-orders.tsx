'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { BuyerOrderSummary, buyerApi } from '@/lib/buyer-api';
import { EmptyState, ErrorState, LoadingState } from '@/components/farmer/async-state';
import { StatusBadge } from '@/components/farmer/status-badge';

export function BuyerOrders() {
  const { t, number, date } = useI18n();
  const [orders, setOrders] = useState<BuyerOrderSummary[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setOrders(await buyerApi.orders()); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  return <div className="buyer-page"><header className="buyer-page-heading"><h1>{t('buyer.orders.title')}</h1><p>{t('buyer.orders.subtitle')}</p></header>{!orders && !error ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void load()} /> : orders?.length === 0 ? <EmptyState title={t('buyer.orders.emptyTitle')} body={t('buyer.orders.emptyBody')} /> : <div className="buyer-order-list">{orders?.map((order) => <article key={order.id}><header><div><span>{t('buyer.orders.order')}</span><strong>#{order.id.slice(0, 8)}</strong></div><StatusBadge status={order.status} /></header><div className="buyer-order-facts"><div><span>{t('buyer.orders.seller')}</span><strong>{order.farmer.fullName}</strong></div><div><span>{t('buyer.orders.total')}</span><strong>{number(order.totalAmount)} UZS</strong></div><div><span>{t('buyer.orders.payment')}</span>{order.paymentStatus ? <StatusBadge status={order.paymentStatus} /> : <strong>{t('common.notAvailable')}</strong>}</div><div><span>{t('buyer.orders.shipment')}</span>{order.shipmentStatus ? <StatusBadge status={order.shipmentStatus} /> : <strong>{t('common.notAvailable')}</strong>}</div></div><footer><span>{date(order.createdAt)}</span><Link className="button button-secondary" href={`/buyer/orders/${order.id}`}>{t('buyer.orders.track')}</Link></footer></article>)}</div>}</div>;
}
