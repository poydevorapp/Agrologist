'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { EmptyState, ErrorState, LoadingState } from '@/components/farmer/async-state';
import { ApiError } from '@/lib/api';
import { TransportShipment, transporterApi } from '@/lib/transporter-api';
import { ShipmentCard } from './shipment-card';

export function MyDeliveries() {
  const { t } = useI18n();
  const [deliveries, setDeliveries] = useState<TransportShipment[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setDeliveries(await transporterApi.deliveries()); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  return <div className="transporter-page"><header className="buyer-page-heading"><div className="eyebrow">{t('transporter.deliveries.eyebrow')}</div><h1>{t('transporter.deliveries.title')}</h1><p>{t('transporter.deliveries.subtitle')}</p></header>{!deliveries && !error ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void load()} /> : deliveries?.length === 0 ? <EmptyState title={t('transporter.deliveries.emptyTitle')} body={t('transporter.deliveries.emptyBody')} /> : <div className="shipment-grid">{deliveries?.map((shipment) => <ShipmentCard delivery key={shipment.shipmentId} shipment={shipment} />)}</div>}</div>;
}
