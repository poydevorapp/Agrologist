'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { BuyerOrder, buyerApi } from '@/lib/buyer-api';
import { ErrorState, LoadingState } from '@/components/farmer/async-state';
import { StatusBadge } from '@/components/farmer/status-badge';
import { PaymentAction, PaymentEscrowPanel } from './payment-escrow-panel';
import { ShipmentMap } from '@/components/maps/shipment-map';

export function OrderTracking({ id }: { id: string }) {
  const { t, number, date } = useI18n();
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState<PaymentAction | null>(null);
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setOrder(await buyerApi.order(id)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [id, t]);
  useEffect(() => { void load(); }, [load]);
  async function run(next: PaymentAction) {
    setAction(next); setError(''); setSuccess('');
    try {
      if (next === 'pay') await buyerApi.demoPay(id); else await buyerApi.acceptDelivery(id);
      await load();
      setSuccess(t(next === 'pay' ? 'buyer.payment.success' : 'buyer.escrow.releaseSuccess'));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          const refreshed = await buyerApi.order(id);
          setOrder(refreshed);
          const alreadyComplete = next === 'pay'
            ? refreshed.payment?.status === 'PAID'
            : refreshed.status === 'COMPLETED' && refreshed.escrow?.status === 'RELEASED';
          if (alreadyComplete) setSuccess(t(next === 'pay' ? 'buyer.payment.alreadyPaid' : 'buyer.escrow.alreadyReleased'));
          else setError(caught.message);
        } catch { setError(caught.message); }
      } else setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    }
    finally { setAction(null); }
  }
  if (!order && !error) return <LoadingState />;
  if (!order) return <ErrorState message={error} retry={() => void load()} />;
  return <div className="buyer-page tracking-page"><Link className="text-link" href="/buyer/orders">← {t('common.back')}</Link><header className="tracking-header"><div><div className="eyebrow">{t('buyer.tracking.title')}</div><h1>#{order.id.slice(0, 8)}</h1><span>{date(order.createdAt)}</span></div><StatusBadge status={order.status} /></header>{error && <div className="form-error" role="alert">{error}</div>}<PaymentEscrowPanel action={action} onAction={(next) => void run(next)} order={order} success={success} />{order.shipment && <ShipmentMap destination={order.shipment.destination} origin={order.shipment.pickup} status={order.shipment.status} />}<div className="tracking-grid payment-tracking-grid"><section className="tracking-main"><h2>{t('buyer.tracking.timeline')}</h2>{!order.shipment ? <div className="state-inline">{t('buyer.tracking.noShipment')}</div> : <><div className="shipment-summary"><StatusBadge status={order.shipment.status} /><span>{order.shipment.transporterName || t('buyer.tracking.notAssigned')}</span><span>{order.shipment.vehicle ? `${order.shipment.vehicle.type} · ${order.shipment.vehicle.plateNumber ?? ''}` : t('buyer.tracking.notAssigned')}</span></div>{order.shipment.events.length === 0 ? <div className="state-inline">{t('buyer.tracking.noEvents')}</div> : <ol className="tracking-timeline">{order.shipment.events.map((event) => <li key={event.id}><span /><div><StatusBadge status={event.type} /><small>{date(event.createdAt)}</small></div></li>)}</ol>}</>}</section><aside className="order-summary"><h2>{t('buyer.tracking.summary')}</h2><div><span>{t('buyer.orders.seller')}</span><strong>{order.farmer.fullName}</strong></div><div><span>{t('buyer.orders.payment')}</span>{order.payment ? <StatusBadge status={order.payment.status} /> : <strong>{t('buyer.payment.notPaid')}</strong>}</div><div><span>{t('buyer.orders.total')}</span><strong>{number(order.totalAmount)} UZS</strong></div></aside></div><section className="tracking-items"><h2>{t('buyer.tracking.items')}</h2>{order.items.map((item) => <article key={item.id}><div><strong>{item.listingTitle}</strong><span>{item.productName}</span></div><span>{number(item.quantity)} × {number(item.unitPrice)} UZS</span><strong>{number(item.lineTotal)} UZS</strong></article>)}</section></div>;
}
