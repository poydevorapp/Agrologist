'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ErrorState, LoadingState } from '@/components/farmer/async-state';
import { ApiError } from '@/lib/api';
import { TransportShipment, TransportVehicle, transporterApi } from '@/lib/transporter-api';
import { ShipmentCard } from './shipment-card';

type DashboardData = { available: number; deliveries: TransportShipment[]; vehicles: TransportVehicle[] };

export function TransporterDashboard() {
  const { t, number } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [available, deliveries, vehicles] = await Promise.all([
        transporterApi.available(1), transporterApi.deliveries(), transporterApi.vehicles(),
      ]);
      setData({ available: available.pagination.totalItems, deliveries, vehicles });
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  if (!data && !error) return <div className="transporter-page"><LoadingState /></div>;
  if (!data) return <div className="transporter-page"><ErrorState message={error} retry={() => void load()} /></div>;
  const active = data.deliveries.filter((shipment) => shipment.availableAction != null);
  return <div className="transporter-page"><section className="transporter-hero"><div><div className="eyebrow">{t('transporter.dashboard.eyebrow')}</div><h1>{t('transporter.dashboard.title')}</h1><p>{t('transporter.dashboard.subtitle')}</p><Link className="button button-primary" href="/transporter/available">{t('transporter.dashboard.findLoads')}</Link></div><div className="transporter-route-art" aria-hidden="true"><span /><span /><span /></div></section><section className="metric-grid transporter-metrics"><article className="metric-card"><span>{t('transporter.dashboard.availableLoads')}</span><strong>{number(data.available)}</strong></article><article className="metric-card"><span>{t('transporter.dashboard.activeDeliveries')}</span><strong>{number(active.length)}</strong></article><article className="metric-card"><span>{t('transporter.dashboard.activeVehicles')}</span><strong>{number(data.vehicles.filter((vehicle) => vehicle.status === 'ACTIVE').length)}</strong></article></section><section className="transporter-section"><div className="buyer-section-heading"><h2>{t('transporter.dashboard.currentDeliveries')}</h2><Link href="/transporter/deliveries">{t('transporter.dashboard.viewAll')} →</Link></div>{active.length === 0 ? <div className="state-inline">{t('transporter.dashboard.noActive')}</div> : <div className="shipment-grid">{active.slice(0, 3).map((shipment) => <ShipmentCard delivery key={shipment.shipmentId} shipment={shipment} />)}</div>}</section></div>;
}
