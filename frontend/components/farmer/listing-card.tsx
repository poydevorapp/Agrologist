'use client';

import Link from 'next/link';
import { FarmerListing } from '@/lib/farmer-api';
import { useI18n } from '@/components/locale-provider';
import { StatusBadge } from './status-badge';

export function ListingCard({ listing }: { listing: FarmerListing }) {
  const { t, number, date } = useI18n();
  return (
    <article className="listing-card">
      <div className="listing-card-top"><StatusBadge status={listing.status} /><span>{date(listing.createdAt)}</span></div>
      <h2>{listing.title}</h2>
      <p>{listing.description || t('common.notAvailable')}</p>
      <div className="listing-card-facts">
        <div><span>{t('listings.availableQuantity')}</span><strong>{number(listing.availableQuantity)} {t(`unit.${listing.unit}`)}</strong></div>
        <div><span>{t('listings.price')}</span><strong>{number(listing.pricePerUnit)} UZS</strong></div>
        <div><span>{t('listings.location')}</span><strong>{listing.district}, {listing.region}</strong></div>
      </div>
      <Link className="text-link" href={`/farmer/listings/${listing.id}`}>{t('common.view')} →</Link>
    </article>
  );
}
