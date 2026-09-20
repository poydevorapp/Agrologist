'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { MarketplaceListing, buyerApi } from '@/lib/buyer-api';
import { ErrorState, LoadingState } from '@/components/farmer/async-state';
import { StatusBadge } from '@/components/farmer/status-badge';
import { useCart } from './cart-provider';

export function MarketplaceDetails({ id }: { id: string }) {
  const { t, number } = useI18n();
  const cart = useCart();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setListing(await buyerApi.listing(id)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [id, t]);
  useEffect(() => { void load(); }, [load]);
  if (!listing && !error) return <LoadingState />;
  if (error || !listing) return <ErrorState message={error} retry={() => void load()} />;
  const numericQuantity = Number(quantity);
  const validQuantity = Number.isFinite(numericQuantity) && numericQuantity > 0 && numericQuantity <= listing.availableQuantity;
  function add() { if (!listing || !validQuantity) return; cart.add(listing.id, numericQuantity); setAdded(true); }
  return <div className="buyer-page"><Link className="text-link" href="/buyer/search">← {t('common.back')}</Link><section className="marketplace-detail"><div className="marketplace-detail-visual"><span>{listing.product.category.name}</span><strong>{listing.product.name}</strong><StatusBadge status={listing.status} /></div><div className="marketplace-detail-content"><div className="eyebrow">{t('buyer.listing.details')}</div><h1>{listing.title}</h1><p>{listing.description || t('common.notAvailable')}</p><div className="detail-facts"><div><span>{t('buyer.listing.seller')}</span><strong>{listing.farmer.farmName || t('common.notAvailable')}</strong></div><div><span>{t('buyer.listing.stock')}</span><strong>{number(listing.availableQuantity)} {t(`unit.${listing.unit}`)}</strong></div><div><span>{t('buyer.listing.unit')}</span><strong>{t(`unit.${listing.unit}`)}</strong></div><div><span>{t('buyer.listing.price')}</span><strong>{number(listing.pricePerUnit)} UZS</strong></div><div><span>{t('buyer.listing.location')}</span><strong>{listing.location.district}, {listing.location.region}</strong></div><div><span>{t('buyer.listing.status')}</span><StatusBadge status={listing.status} /></div></div><div className="add-cart-row"><label>{t('buyer.listing.quantity')}<input type="number" min="0.01" max={listing.availableQuantity} step="0.01" value={quantity} onChange={(event) => { setQuantity(event.target.value); setAdded(false); }} /></label><button className="button button-primary" disabled={!validQuantity} type="button" onClick={add}>{added ? t('buyer.listing.added') : t('buyer.listing.addCart')}</button></div></div></section></div>;
}
