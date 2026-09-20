'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { MarketplaceListing, buyerApi } from '@/lib/buyer-api';
import { EmptyState, ErrorState, LoadingState } from '@/components/farmer/async-state';
import { useCart } from './cart-provider';

export type CartListing = { listing: MarketplaceListing; quantity: number };

export function useCartListings() {
  const cart = useCart();
  const { t } = useI18n();
  const [lines, setLines] = useState<CartListing[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!cart.ready) return;
    setError('');
    if (cart.items.length === 0) { setLines([]); return; }
    try {
      const listings = await Promise.all(cart.items.map((item) => buyerApi.listing(item.listingId)));
      setLines(listings.map((listing, index) => ({ listing, quantity: cart.items[index]!.quantity })));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [cart.ready, cart.items, t]);
  useEffect(() => { void load(); }, [load]);
  return { cart, lines, error, load };
}

export function CartView() {
  const { t, number } = useI18n();
  const { cart, lines, error, load } = useCartListings();
  const total = lines?.reduce((sum, line) => sum + line.listing.pricePerUnit * line.quantity, 0) ?? 0;
  return <div className="buyer-page"><header className="buyer-page-heading"><h1>{t('buyer.cart.title')}</h1><p>{t('buyer.cart.subtitle')}</p></header>{!lines && !error ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void load()} /> : lines?.length === 0 ? <EmptyState title={t('buyer.cart.emptyTitle')} body={t('buyer.cart.emptyBody')} action={<Link className="button button-primary" href="/buyer/search">{t('buyer.home.browse')}</Link>} /> : <><div className="cart-layout"><section className="cart-lines">{lines?.map(({ listing, quantity }) => <article className="cart-line" key={listing.id}><div><span>{listing.product.name}</span><Link href={`/buyer/listings/${listing.id}`}>{listing.title}</Link><small>{listing.farmer.farmName || t('common.notAvailable')}</small></div><label>{t('common.quantity')}<input type="number" min="0.01" max={listing.availableQuantity} step="0.01" value={quantity} onChange={(event) => cart.update(listing.id, Number(event.target.value))} /></label><div className="cart-line-price"><strong>{number(listing.pricePerUnit * quantity)} UZS</strong><button type="button" onClick={() => cart.remove(listing.id)}>{t('buyer.cart.remove')}</button></div></article>)}</section><aside className="cart-summary"><span>{t('buyer.cart.subtotal')}</span><strong>{number(total)} UZS</strong><Link className="button button-primary button-full" href="/buyer/checkout">{t('buyer.cart.checkout')}</Link><Link className="text-link" href="/buyer/search">{t('common.continueShopping')}</Link></aside></div></>}</div>;
}
