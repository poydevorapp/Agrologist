'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { FarmerListing, farmerApi } from '@/lib/farmer-api';
import { EmptyState, ErrorState, LoadingState } from './async-state';
import { ListingCard } from './listing-card';

export function ListingsList() {
  const { t } = useI18n();
  const [items, setItems] = useState<FarmerListing[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setItems(await farmerApi.listings()); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  return <div className="farmer-page"><header className="farmer-page-heading"><div><h1>{t('listings.title')}</h1><p>{t('listings.subtitle')}</p></div><Link className="button button-primary" href="/farmer/listings/new">{t('listings.create')}</Link></header>{!items && !error ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void load()} /> : items?.length === 0 ? <EmptyState title={t('listings.emptyTitle')} body={t('listings.emptyBody')} action={<Link className="button button-primary" href="/farmer/listings/new">{t('listings.create')}</Link>} /> : <div className="listing-grid">{items?.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>}</div>;
}
