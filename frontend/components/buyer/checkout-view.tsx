'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { buyerApi } from '@/lib/buyer-api';
import { EmptyState, ErrorState, LoadingState } from '@/components/farmer/async-state';
import { useCartListings } from './cart-view';

export function CheckoutView() {
  const router = useRouter();
  const { t, number } = useI18n();
  const { cart, lines, error: loadError, load } = useCartListings();
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const total = lines?.reduce((sum, line) => sum + line.listing.pricePerUnit * line.quantity, 0) ?? 0;
  async function placeOrder() {
    if (!lines?.length) return;
    setPlacing(true); setError('');
    const completed: string[] = [];
    try {
      for (const line of lines) {
        await buyerApi.createOrder(line.listing.id, line.quantity);
        completed.push(line.listing.id);
      }
      cart.clear();
      router.push('/buyer/orders');
    } catch (caught) {
      if (completed.length) cart.removeMany(completed);
      setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    } finally { setPlacing(false); }
  }
  return <div className="buyer-page"><header className="buyer-page-heading"><h1>{t('buyer.checkout.title')}</h1><p>{t('buyer.checkout.subtitle')}</p></header>{!lines && !loadError ? <LoadingState /> : loadError ? <ErrorState message={loadError} retry={() => void load()} /> : lines?.length === 0 ? <EmptyState title={t('buyer.cart.emptyTitle')} body={t('buyer.cart.emptyBody')} action={<Link className="button button-primary" href="/buyer/search">{t('buyer.home.browse')}</Link>} /> : <div className="checkout-layout"><section className="checkout-review"><h2>{t('buyer.checkout.review')}</h2>{lines?.map((line) => <article key={line.listing.id}><div><strong>{line.listing.title}</strong><span>{line.quantity} {t(`unit.${line.listing.unit}`)}</span></div><strong>{number(line.listing.pricePerUnit * line.quantity)} UZS</strong></article>)}</section><aside className="cart-summary"><p>{t('buyer.checkout.notice')}</p><span>{t('buyer.cart.subtotal')}</span><strong>{number(total)} UZS</strong>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary button-full" type="button" disabled={placing} onClick={() => void placeOrder()}>{placing ? t('buyer.checkout.placing') : t('buyer.checkout.place')}</button></aside></div>}</div>;
}
