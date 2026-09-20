'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { MarketplaceListing, buyerApi } from '@/lib/buyer-api';
import { ErrorState, LoadingState } from '@/components/farmer/async-state';
import { MarketplaceCard } from './marketplace-card';

export function BuyerHome() {
  const { t } = useI18n();
  const [listings, setListings] = useState<MarketplaceListing[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { const params = new URLSearchParams({ page_size: '6' }); setListings((await buyerApi.marketplace(params)).data); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  return <div className="buyer-page"><section className="buyer-hero"><div><div className="eyebrow">{t('buyer.home.eyebrow')}</div><h1>{t('buyer.home.title')}</h1><p>{t('buyer.home.subtitle')}</p><Link className="button button-primary" href="/buyer/search">{t('buyer.home.browse')}</Link></div><div className="buyer-hero-pattern"><span>{t('unit.KG')}</span><span>{t('unit.TON')}</span><span>{t('unit.PIECE')}</span></div></section><section className="buyer-section"><div className="buyer-section-heading"><h2>{t('buyer.home.recent')}</h2><Link href="/buyer/search">{t('buyer.home.browse')} →</Link></div>{!listings && !error ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void load()} /> : <div className="marketplace-grid">{listings?.map((listing) => <MarketplaceCard listing={listing} key={listing.id} />)}</div>}</section></div>;
}
