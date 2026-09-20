'use client';

import Link from 'next/link';
import { useI18n } from '@/components/locale-provider';
import { MarketplaceListing } from '@/lib/buyer-api';
import { StatusBadge } from '@/components/farmer/status-badge';

export function MarketplaceCard({ listing }: { listing: MarketplaceListing }) {
  const { t, number } = useI18n();
  return <article className="marketplace-card"><div className="marketplace-card-accent"><span>{listing.product.category.name}</span><StatusBadge status={listing.status} /></div><div className="marketplace-card-body"><span className="product-name">{listing.product.name}</span><h2>{listing.title}</h2><p>{listing.description || t('common.notAvailable')}</p><div className="marketplace-facts"><div><span>{t('buyer.listing.seller')}</span><strong>{listing.farmer.farmName || t('common.notAvailable')}</strong></div><div><span>{t('buyer.listing.stock')}</span><strong>{number(listing.availableQuantity)} {t(`unit.${listing.unit}`)}</strong></div><div><span>{t('buyer.listing.price')}</span><strong>{number(listing.pricePerUnit)} UZS</strong></div><div><span>{t('buyer.listing.location')}</span><strong>{listing.location.district}, {listing.location.region}</strong></div></div><Link className="button button-secondary button-full" href={`/buyer/listings/${listing.id}`}>{t('buyer.listing.details')}</Link></div></article>;
}
