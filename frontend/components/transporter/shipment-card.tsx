'use client';

import Link from 'next/link';
import { useI18n } from '@/components/locale-provider';
import { StatusBadge } from '@/components/farmer/status-badge';
import { TransportShipment } from '@/lib/transporter-api';

export function ShipmentCard({ shipment, delivery = false }: { shipment: TransportShipment; delivery?: boolean }) {
  const { t, number, date } = useI18n();
  const href = delivery ? `/transporter/deliveries/${shipment.shipmentId}` : `/transporter/shipments/${shipment.shipmentId}`;
  return <article className="shipment-card"><header><div><span>{t('transporter.shipment.label')}</span><strong>#{shipment.shipmentId.slice(0, 8)}</strong></div><StatusBadge status={shipment.status ?? 'PENDING'} /></header><p className="shipment-cargo">{shipment.load.summary}</p><div className="shipment-route"><div><span>{t('transporter.shipment.origin')}</span><strong>{shipment.pickup.district}, {shipment.pickup.region}</strong></div><span className="route-arrow" aria-hidden="true">→</span><div><span>{t('transporter.shipment.destination')}</span><strong>{shipment.destination.district}, {shipment.destination.region}</strong></div></div><div className="shipment-facts"><div><span>{t('transporter.shipment.weight')}</span><strong>{shipment.load.requiredCapacityKg === null ? t('common.notAvailable') : `${number(shipment.load.requiredCapacityKg)} ${t('unit.KG')}`}</strong></div><div><span>{t('transporter.shipment.items')}</span><strong>{number(shipment.order.itemCount)}</strong></div><div><span>{t('transporter.shipment.offerPrice')}</span><strong>{shipment.acceptedPrice == null ? t('common.notAvailable') : `${number(shipment.acceptedPrice)} UZS`}</strong></div></div><footer><span>{date(shipment.createdAt)}</span><Link className="button button-secondary" href={href}>{t(delivery ? 'transporter.deliveries.track' : 'transporter.available.details')}</Link></footer></article>;
}
