'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { FarmerListing, farmerApi } from '@/lib/farmer-api';
import { ErrorState, LoadingState } from './async-state';
import { StatusBadge } from './status-badge';

export function ListingDetails({ id }: { id: string }) {
  const { t, number, date } = useI18n();
  const [listing, setListing] = useState<FarmerListing | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try { setListing(await farmerApi.listing(id)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [id, t]);
  useEffect(() => { void load(); }, [load]);
  async function cancel() {
    if (!window.confirm(t('listings.cancelConfirm'))) return;
    setCancelling(true);
    try { setListing(await farmerApi.cancelListing(id)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
    finally { setCancelling(false); }
  }
  if (!listing && !error) return <LoadingState />;
  if (error && !listing) return <ErrorState message={error} retry={() => void load()} />;
  if (!listing) return null;
  const cancellable = ['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED'].includes(listing.status);
  const editable = ['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED'].includes(listing.status);
  return (
    <div className="farmer-page detail-page">
      <Link className="text-link" href="/farmer/listings">← {t('common.back')}</Link>
      <header className="farmer-page-heading detail-heading"><div><StatusBadge status={listing.status} /><h1>{listing.title}</h1><p>{listing.description || t('common.notAvailable')}</p></div><div className="detail-actions">{editable && <Link className="button button-secondary" href={`/farmer/listings/${id}/edit`}>{t('common.edit')}</Link>}{cancellable && <button className="button button-danger" type="button" disabled={cancelling} onClick={() => void cancel()}>{t('listings.cancel')}</button>}</div></header>
      {error && <div className="form-error" role="alert">{error}</div>}
      <section className="detail-grid">
        <article><span>{t('listings.originalQuantity')}</span><strong>{number(listing.originalQuantity)} {t(`unit.${listing.unit}`)}</strong></article>
        <article><span>{t('listings.availableQuantity')}</span><strong>{number(listing.availableQuantity)} {t(`unit.${listing.unit}`)}</strong></article>
        <article><span>{t('listings.price')}</span><strong>{number(listing.pricePerUnit)} UZS</strong></article>
        <article><span>{t('listings.location')}</span><strong>{listing.district}, {listing.region}</strong></article>
        <article><span>{t('listings.created')}</span><strong>{date(listing.createdAt)}</strong></article>
        <article><span>{t('listings.updated')}</span><strong>{date(listing.updatedAt)}</strong></article>
      </section>
    </div>
  );
}
