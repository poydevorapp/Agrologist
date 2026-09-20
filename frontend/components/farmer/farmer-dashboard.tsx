'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { FarmerListing, FarmerOrder, FarmerSalesInsights, farmerApi } from '@/lib/farmer-api';
import { ProductSales } from './product-sales';
import { ErrorState, LoadingState } from './async-state';
import { ListingCard } from './listing-card';
import { StatusBadge } from './status-badge';

export function FarmerDashboard() {
  const { t, number, date } = useI18n();
  const [data, setData] = useState<{ listings: FarmerListing[]; orders: FarmerOrder[]; sales: FarmerSalesInsights } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [listings, orders, sales] = await Promise.all([farmerApi.listings(), farmerApi.orders(), farmerApi.salesInsights()]);
      setData({ listings, orders, sales });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  if (!data && !error) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  const listings = data?.listings ?? [];
  const orders = data?.orders ?? [];
  const active = listings.filter((listing) => listing.status === 'ACTIVE').length;
  const stock = listings.reduce((sum, listing) => sum + listing.availableQuantity, 0);
  return (
    <div className="farmer-page">
      <header className="farmer-page-heading"><div><div className="eyebrow">{t('farmer.dashboard.eyebrow')}</div><h1>{t('farmer.dashboard.title')}</h1><p>{t('farmer.dashboard.subtitle')}</p></div><Link className="button button-primary" href="/farmer/listings/new">{t('listings.create')}</Link></header>
      <section className="metric-grid">
        <div className="metric-card"><span>{t('farmer.dashboard.totalListings')}</span><strong>{number(listings.length)}</strong></div>
        <div className="metric-card"><span>{t('farmer.dashboard.activeListings')}</span><strong>{number(active)}</strong></div>
        <div className="metric-card"><span>{t('farmer.dashboard.availableStock')}</span><strong>{number(stock)}</strong></div>
        <div className="metric-card"><span>{t('farmer.dashboard.orders')}</span><strong>{number(orders.length)}</strong></div>
      </section>
      <ProductSales products={data?.sales.products ?? []} />
      <section className="farmer-section"><div className="farmer-section-heading"><h2>{t('farmer.dashboard.recentListings')}</h2><Link href="/farmer/listings">{t('farmer.dashboard.allListings')}</Link></div><div className="listing-grid">{listings.slice(0, 3).map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div></section>
      <section className="farmer-section"><div className="farmer-section-heading"><h2>{t('farmer.dashboard.recentOrders')}</h2><Link href="/farmer/orders">{t('farmer.dashboard.allOrders')}</Link></div><div className="compact-orders">{orders.slice(0, 4).map((order) => <article key={order.id}><div><strong>{t('orders.order')} #{order.id.slice(0, 8)}</strong><span>{order.buyer.fullName} · {date(order.createdAt)}</span></div><div><StatusBadge status={order.status} /><strong>{number(order.totalAmount)} UZS</strong></div></article>)}</div></section>
    </div>
  );
}
