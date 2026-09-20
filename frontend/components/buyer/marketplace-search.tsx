'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { CatalogCategory } from '@/lib/farmer-api';
import { MarketplacePage, buyerApi } from '@/lib/buyer-api';
import { EmptyState, ErrorState, LoadingState } from '@/components/farmer/async-state';
import { MarketplaceCard } from './marketplace-card';

type SearchValues = { category_id: string; product_id: string; region: string; district: string; min_price: string; max_price: string; page: string };
const blank: SearchValues = { category_id: '', product_id: '', region: '', district: '', min_price: '', max_price: '', page: '1' };

export function MarketplaceSearch({ initial }: { initial: Partial<SearchValues> }) {
  const router = useRouter();
  const { t } = useI18n();
  const [filters, setFilters] = useState<SearchValues>({ ...blank, ...initial });
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [result, setResult] = useState<MarketplacePage | null>(null);
  const [error, setError] = useState('');
  const products = useMemo(() => catalog.find((category) => category.id === filters.category_id)?.products ?? catalog.flatMap((category) => category.products), [catalog, filters.category_id]);
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    params.set('page_size', '12');
    return params;
  }, [filters]);
  const load = useCallback(async () => {
    setError('');
    try {
      const [catalogResult, listings] = await Promise.all([buyerApi.catalog(), buyerApi.marketplace(queryString)]);
      setCatalog(catalogResult.categories); setResult(listings);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [queryString, t]);
  useEffect(() => { void load(); }, [load]);
  function set<K extends keyof SearchValues>(key: K, value: SearchValues[K]) { setFilters((current) => ({ ...current, [key]: value, page: key === 'page' ? value : '1' })); }
  function submit(event: FormEvent) { event.preventDefault(); router.push(`/buyer/search?${queryString}`); void load(); }
  function page(next: number) { const updated = new URLSearchParams(queryString); updated.set('page', String(next)); router.push(`/buyer/search?${updated}`); set('page', String(next)); }
  return <div className="buyer-page"><header className="buyer-page-heading"><h1>{t('buyer.search.title')}</h1><p>{t('buyer.search.subtitle')}</p></header><form className="marketplace-filters" onSubmit={submit}><div className="filter-title">{t('buyer.search.filters')}</div><label>{t('listings.category')}<select value={filters.category_id} onChange={(event) => { setFilters((current) => ({ ...current, category_id: event.target.value, product_id: '', page: '1' })); }}><option value="">{t('buyer.search.category')}</option>{catalog.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>{t('listings.product')}<select value={filters.product_id} onChange={(event) => set('product_id', event.target.value)}><option value="">{t('buyer.search.product')}</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label>{t('buyer.search.region')}<input value={filters.region} onChange={(event) => set('region', event.target.value)} /></label><label>{t('buyer.search.district')}<input value={filters.district} onChange={(event) => set('district', event.target.value)} /></label><label>{t('buyer.search.minPrice')}<input type="number" min="0" step="0.01" value={filters.min_price} onChange={(event) => set('min_price', event.target.value)} /></label><label>{t('buyer.search.maxPrice')}<input type="number" min="0" step="0.01" value={filters.max_price} onChange={(event) => set('max_price', event.target.value)} /></label><div className="filter-actions"><button className="button button-quiet" type="button" onClick={() => { setFilters(blank); router.push('/buyer/search'); }}>{t('buyer.search.clear')}</button><button className="button button-primary" type="submit">{t('buyer.search.apply')}</button></div></form><section className="buyer-section"><div className="buyer-section-heading"><h2>{t('buyer.search.results')}</h2>{result && <span>{result.pagination.totalItems}</span>}</div>{!result && !error ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void load()} /> : result?.data.length === 0 ? <EmptyState title={t('buyer.search.emptyTitle')} body={t('buyer.search.emptyBody')} /> : <><div className="marketplace-grid">{result?.data.map((listing) => <MarketplaceCard key={listing.id} listing={listing} />)}</div>{result && result.pagination.totalPages > 1 && <div className="pagination"><button className="button button-secondary" disabled={result.pagination.page <= 1} onClick={() => page(result.pagination.page - 1)}>{t('buyer.pagination.previous')}</button><span>{t('buyer.pagination.page', { page: result.pagination.page, total: result.pagination.totalPages })}</span><button className="button button-secondary" disabled={result.pagination.page >= result.pagination.totalPages} onClick={() => page(result.pagination.page + 1)}>{t('buyer.pagination.next')}</button></div>}</>}</section></div>;
}
