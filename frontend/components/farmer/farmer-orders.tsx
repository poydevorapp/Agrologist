'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { FarmerOrder, FarmerTransportOffers, farmerApi } from '@/lib/farmer-api';
import { EmptyState, ErrorState, LoadingState } from './async-state';
import { StatusBadge } from './status-badge';
import type { MessageKey } from '@/i18n/messages';

export function FarmerOrders() {
  const { t, number, date } = useI18n();
  const [orders, setOrders] = useState<FarmerOrder[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [offers, setOffers] = useState<Record<string, FarmerTransportOffers>>({});
  const load = useCallback(async () => {
    setError('');
    try { setOrders(await farmerApi.orders()); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  async function transition(order: FarmerOrder, action: 'CONFIRM' | 'REQUEST_TRANSPORT') {
    setBusy(`${order.id}:${action}`); setError('');
    try { await farmerApi.transitionOrder(order.id, action); await load(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
    finally { setBusy(null); }
  }

  async function refreshOffers(orderId: string) {
    setBusy(`${orderId}:offers`); setError('');
    try {
      const result = await farmerApi.transportOffers(orderId);
      setOffers((current) => ({ ...current, [orderId]: result }));
    }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
    finally { setBusy(null); }
  }

  async function acceptOffer(orderId: string, offerId: string) {
    setBusy(`${orderId}:${offerId}`); setError('');
    try { await farmerApi.acceptTransportOffer(offerId); await load(); setOffers((current) => ({ ...current, [orderId]: { ...current[orderId]!, offers: [] } })); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
    finally { setBusy(null); }
  }

  return <div className="farmer-page"><header className="farmer-page-heading"><div><h1>{t('orders.title')}</h1><p>{t('orders.subtitle')}</p></div></header>{error && <div className="form-error" role="alert">{error}</div>}{!orders && !error ? <LoadingState /> : orders?.length === 0 ? <EmptyState title={t('orders.emptyTitle')} body={t('orders.emptyBody')} /> : <div className="order-list">{orders?.map((order) => <article className="order-card" key={order.id}><header><div><span>{t('orders.order')}</span><strong>#{order.id.slice(0, 8)}</strong></div><StatusBadge status={order.status} /></header><div className="order-meta"><div><span>{t('orders.buyer')}</span><strong>{order.buyer.fullName}</strong></div><div><span>{t('orders.placed')}</span><strong>{date(order.createdAt)}</strong></div><div><span>{t('orders.total')}</span><strong>{number(order.totalAmount)} UZS</strong></div></div><div className="order-items"><span>{t('orders.items')}</span>{order.items.map((item) => <div key={item.id}><strong>{item.listingTitle}</strong><span>{number(item.quantity)} × {number(item.unitPrice)} UZS</span></div>)}</div><footer className="order-actions">{order.status === 'PENDING' && <button className="button button-primary" disabled={busy !== null} onClick={() => void transition(order, 'CONFIRM')}>{busy === `${order.id}:CONFIRM` ? t('orders.processing') : t('orders.confirm')}</button>}{order.status === 'CONFIRMED' && <button className="button button-primary" disabled={busy !== null} onClick={() => void transition(order, 'REQUEST_TRANSPORT')}>{busy === `${order.id}:REQUEST_TRANSPORT` ? t('orders.processing') : t('orders.requestTransport')}</button>}{order.status === 'TRANSPORT_PENDING' && <><button className="button button-secondary" disabled={busy !== null} onClick={() => void refreshOffers(order.id)}>{busy === `${order.id}:offers` ? t('orders.processing') : t('orders.refreshOffers')}</button>{offers[order.id]?.offers.length === 0 && <span className="muted">{t('orders.noOffers')}</span>}</> }</footer>{offers[order.id]?.offers.map((offer) => <div className="transport-offer" key={offer.id}><div><strong>{offer.transporter.fullName}</strong><span>{t(`transporter.vehicle.type.${offer.vehicle.type}` as MessageKey)} · {offer.vehicle.plateNumber}</span></div><strong>{number(offer.offeredPrice)} UZS</strong><button className="button button-primary" disabled={busy !== null} onClick={() => void acceptOffer(order.id, offer.id)}>{busy === `${order.id}:${offer.id}` ? t('orders.processing') : t('orders.acceptOffer')}</button></div>)}</article>)}</div>}</div>;
}
