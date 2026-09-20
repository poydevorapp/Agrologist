'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { StatusBadge } from '@/components/farmer/status-badge';
import { BuyerOrder } from '@/lib/buyer-api';
import { MessageKey } from '@/i18n/messages';
import { walletApi } from '@/lib/wallet-api';

export type PaymentAction = 'pay' | 'accept';

export function PaymentEscrowPanel({ order, action, success, onAction }: {
  order: BuyerOrder;
  action: PaymentAction | null;
  success: string;
  onAction(next: PaymentAction): void;
}) {
  const { t, number, date } = useI18n();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void walletApi.mine().then((wallet) => { if (active) setBalance(wallet.balance); })
      .catch(() => { if (active) setBalance(null); });
    return () => { active = false; };
  }, [order.id, order.payment?.status, success]);

  const escrowState = !order.escrow || order.escrow.status === 'CREATED' ? 'UNFUNDED' : order.escrow.status;
  const deliveryState = order.shipment?.status ?? 'PENDING';
  const paid = order.payment?.status === 'PAID';
  const released = escrowState === 'RELEASED';
  const escrowMessage = `buyer.escrow.message.${escrowState}` as MessageKey;
  const payable = paid ? order.payment?.amount : order.demoPaymentQuote?.payableTotal;
  const insufficientBalance = balance !== null && balance < (order.demoPaymentQuote?.payableTotal ?? 0);

  return <section className="payment-escrow-card" aria-labelledby="payment-escrow-title">
    <header><div><div className="eyebrow">{t('buyer.payment.eyebrow')}</div><h2 id="payment-escrow-title">{t('buyer.payment.title')}</h2></div><strong className="payment-total">{number(payable ?? order.totalAmount)} UZS</strong></header>
    {success && <div className="payment-success" role="status">{success}</div>}
    <div className="payment-quote"><span>{t('wallet.orderTotal')}: {number(order.totalAmount)} UZS</span><span>{t('wallet.platformFee')}: {number(order.demoPaymentQuote?.platformFee ?? 0)} UZS</span><span>{t('wallet.balance')}: {balance === null ? t('nav.loading') : `${number(balance)} UZS`}</span><Link href="/wallet">{t('wallet.open')} →</Link></div>
    <div className="payment-state-grid"><article><span>{t('buyer.payment.status')}</span>{order.payment ? <StatusBadge status={order.payment.status} /> : <strong>{t('buyer.payment.notPaid')}</strong>}</article><article><span>{t('buyer.escrow.status')}</span><StatusBadge status={escrowState} /></article><article><span>{t('buyer.payment.deliveryStatus')}</span><StatusBadge status={deliveryState} /></article><article><span>{t('buyer.payment.completionStatus')}</span><StatusBadge status={order.status} /></article></div>
    <div className={`escrow-protection escrow-${escrowState.toLowerCase()}`}><span className="escrow-shield" aria-hidden="true">✓</span><div><strong>{t('buyer.escrow.protectionTitle')}</strong><p>{t(escrowMessage)}</p>{order.escrow?.releasedAt && <small>{t('buyer.escrow.releasedAt', { date: date(order.escrow.releasedAt) })}</small>}</div></div>
    <div className="payment-actions"><button className="button button-primary" disabled={action !== null || !order.availableActions.demoPay || insufficientBalance} onClick={() => onAction('pay')}>{action === 'pay' ? t('buyer.tracking.paying') : paid ? t('buyer.payment.paid') : t('buyer.tracking.payDemo')}</button><button className="button button-secondary" disabled={action !== null || !order.availableActions.acceptDelivery} onClick={() => onAction('accept')}>{action === 'accept' ? t('buyer.tracking.accepting') : released ? t('buyer.escrow.released') : t('buyer.tracking.acceptDelivery')}</button></div>
    {!paid && !order.availableActions.demoPay && <p className="form-hint">{t(order.status === 'PENDING' ? 'buyer.payment.waitingForFarmer' : 'buyer.payment.waitingForTransport')}</p>}
    {insufficientBalance && !paid && <p className="form-error">{t('wallet.insufficient')}</p>}
    <p className="payment-disclaimer">{t('buyer.payment.demoNotice')}</p>
  </section>;
}
