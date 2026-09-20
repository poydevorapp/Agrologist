'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { EmptyState, ErrorState, LoadingState } from '@/components/farmer/async-state';
import { ApiError } from '@/lib/api';
import { AvailableShipmentsPage, transporterApi } from '@/lib/transporter-api';
import { ShipmentCard } from './shipment-card';

export function AvailableShipments() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AvailableShipmentsPage | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError(''); setResult(null);
    try { setResult(await transporterApi.available(page)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [page, t]);
  useEffect(() => { void load(); }, [load]);
  return <div className="transporter-page"><header className="buyer-page-heading"><div className="eyebrow">{t('transporter.available.eyebrow')}</div><h1>{t('transporter.available.title')}</h1><p>{t('transporter.available.subtitle')}</p></header>{!result && !error ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void load()} /> : result?.data.length === 0 ? <EmptyState title={t('transporter.available.emptyTitle')} body={t('transporter.available.emptyBody')} /> : <><div className="shipment-grid">{result?.data.map((shipment) => <ShipmentCard key={shipment.shipmentId} shipment={shipment} />)}</div><nav className="pagination" aria-label={t('transporter.available.pagination')}><button className="button button-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t('buyer.pagination.previous')}</button><span>{t('buyer.pagination.page', { page, total: result?.pagination.totalPages ?? 1 })}</span><button className="button button-secondary" disabled={page >= (result?.pagination.totalPages ?? 1)} onClick={() => setPage((current) => current + 1)}>{t('buyer.pagination.next')}</button></nav></>}</div>;
}
