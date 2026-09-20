'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ErrorState, LoadingState } from '@/components/farmer/async-state';
import { StatusBadge } from '@/components/farmer/status-badge';
import { MessageKey } from '@/i18n/messages';
import { ApiError } from '@/lib/api';
import {
  CreateVehicleInput, ShipmentAction, TransportQuote, TransportShipmentDetail, TransportVehicle, transporterApi,
} from '@/lib/transporter-api';
import { ShipmentMap } from '@/components/maps/shipment-map';

const actionLabels: Record<ShipmentAction, MessageKey> = {
  PICKED_UP: 'transporter.action.pickedUp',
  IN_TRANSIT: 'transporter.action.inTransit',
  DELIVERED: 'transporter.action.delivered',
};

const vehicleTypes: CreateVehicleInput['vehicle_type'][] =
  ['TRUCK', 'VAN', 'PICKUP', 'MOTORCYCLE', 'TRACTOR_TRAILER'];

function VehicleRegistration({
  requiredCapacityKg, onCreated,
}: {
  requiredCapacityKg: number | null;
  onCreated(vehicle: TransportVehicle): void;
}) {
  const { t, number } = useI18n();
  const [type, setType] = useState<CreateVehicleInput['vehicle_type']>('TRUCK');
  const [plate, setPlate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [refrigerated, setRefrigerated] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      const vehicle = await transporterApi.createVehicle({
        vehicle_type: type,
        plate_number: plate.trim(),
        capacity_kg: Number(capacity),
        refrigerated,
      });
      onCreated(vehicle);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    } finally {
      setWorking(false);
    }
  }

  return <form className="offer-form vehicle-registration" onSubmit={(event) => void submit(event)}>
    <h2>{t('transporter.vehicle.addTitle')}</h2>
    <p className="form-hint">{t('transporter.vehicle.addHint')}</p>
    {requiredCapacityKg !== null && <p className="form-hint">
      {t('transporter.vehicle.requiredCapacity', { capacity: number(requiredCapacityKg) })}
    </p>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <label>{t('transporter.vehicle.type')}
      <select value={type} onChange={(event) => setType(event.target.value as CreateVehicleInput['vehicle_type'])}>
        {vehicleTypes.map((value) => <option value={value} key={value}>{t(`transporter.vehicle.type.${value}` as MessageKey)}</option>)}
      </select>
    </label>
    <label>{t('transporter.vehicle.plate')}
      <input value={plate} onChange={(event) => setPlate(event.target.value)} required minLength={2} maxLength={20} />
    </label>
    <label>{t('transporter.vehicle.capacity')}
      <input type="number" min={Math.max(0.01, requiredCapacityKg ?? 0.01)} step="0.01"
        value={capacity} onChange={(event) => setCapacity(event.target.value)} required />
    </label>
    <label className="vehicle-checkbox"><input type="checkbox" checked={refrigerated}
      onChange={(event) => setRefrigerated(event.target.checked)} />{t('transporter.vehicle.refrigerated')}</label>
    <button className="button button-primary button-full" disabled={working} type="submit">
      {working ? t('transporter.vehicle.adding') : t('transporter.vehicle.add')}
    </button>
  </form>;
}

export function ShipmentDetails({ id, delivery = false }: { id: string; delivery?: boolean }) {
  const { t, number, date } = useI18n();
  const [shipment, setShipment] = useState<TransportShipmentDetail | null>(null);
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [quote, setQuote] = useState<TransportQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [shipmentResult, vehicleResult] = await Promise.all([
        transporterApi.shipment(id), transporterApi.vehicles(),
      ]);
      setShipment(shipmentResult);
      setVehicles(vehicleResult);
      const eligible = vehicleResult.filter((vehicle) => vehicle.status === 'ACTIVE'
        && (shipmentResult.load.requiredCapacityKg === null
          || vehicle.capacityKg >= shipmentResult.load.requiredCapacityKg));
      setVehicleId((current) => eligible.some((vehicle) => vehicle.id === current)
        ? current : eligible[0]?.id ?? '');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    }
  }, [id, t]);

  useEffect(() => { void load(); }, [load]);

  const activeVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.status === 'ACTIVE'
    && (shipment?.load.requiredCapacityKg === null
      || (shipment?.load.requiredCapacityKg !== undefined
        && vehicle.capacityKg >= shipment.load.requiredCapacityKg))), [vehicles, shipment?.load.requiredCapacityKg]);

  useEffect(() => {
    if (!shipment || shipment.status !== 'PENDING' || !vehicleId) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    let active = true;
    setQuote(null);
    setQuoteError('');
    void transporterApi.quote(shipment.shipmentId, vehicleId)
      .then((result) => { if (active) setQuote(result); })
      .catch((caught) => {
        if (active) setQuoteError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
      });
    return () => { active = false; };
  }, [shipment?.shipmentId, shipment?.status, vehicleId, quoteAttempt, t]);

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicleId || quote === null || quote.vehicleId !== vehicleId) return;
    setWorking(true);
    setError('');
    try {
      await transporterApi.createOffer(id, vehicleId);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    } finally {
      setWorking(false);
    }
  }

  async function transition(action: ShipmentAction) {
    setWorking(true);
    setError('');
    try {
      await transporterApi.transition(id, action);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    } finally {
      setWorking(false);
    }
  }

  if (!shipment && !error) return <div className="transporter-page"><LoadingState /></div>;
  if (!shipment) return <div className="transporter-page"><ErrorState message={error} retry={() => void load()} /></div>;

  const canOffer = shipment.status === 'PENDING'
    && !['PENDING', 'ACCEPTED'].includes(shipment.ownOffer?.status ?? '');

  return <div className="transporter-page shipment-detail-page">
    <Link className="text-link" href={delivery ? '/transporter/deliveries' : '/transporter/available'}>
      ← {t('common.back')}
    </Link>
    <header className="tracking-header">
      <div><div className="eyebrow">{t(delivery ? 'transporter.tracking.eyebrow' : 'transporter.details.eyebrow')}</div>
        <h1>#{shipment.shipmentId.slice(0, 8)}</h1><span>{date(shipment.createdAt)}</span></div>
      <StatusBadge status={shipment.status} />
    </header>
    {error && <div className="form-error" role="alert">{error}</div>}
    {delivery && <ShipmentMap destination={shipment.destination} origin={shipment.pickup} status={shipment.status} />}
    <div className="shipment-detail-layout">
      <main>
        <section className="route-panel">
          <div><span>{t('transporter.shipment.origin')}</span><strong>{shipment.pickup.district}, {shipment.pickup.region}</strong></div>
          <div className="route-line"><span /><span /></div>
          <div><span>{t('transporter.shipment.destination')}</span><strong>{shipment.destination.district}, {shipment.destination.region}</strong></div>
        </section>
        <section className="shipment-detail-card">
          <h2>{t('transporter.details.cargo')}</h2>
          <p className="shipment-cargo-large">{shipment.load.summary}</p>
          <div className="detail-facts">
            <div><span>{t('transporter.shipment.weight')}</span><strong>{shipment.load.requiredCapacityKg === null
              ? t('common.notAvailable') : `${number(shipment.load.requiredCapacityKg)} ${t('unit.KG')}`}</strong></div>
            <div><span>{t('transporter.shipment.items')}</span><strong>{number(shipment.order.itemCount)}</strong></div>
            <div><span>{t('transporter.details.order')}</span><strong>#{shipment.order.id.slice(0, 8)}</strong></div>
            <div><span>{t('transporter.shipment.offerPrice')}</span><strong>{shipment.acceptedPrice == null
              ? t('common.notAvailable') : `${number(shipment.acceptedPrice)} UZS`}</strong></div>
          </div>
        </section>
        {delivery && <section className="shipment-detail-card">
          <h2>{t('transporter.tracking.timeline')}</h2>
          {shipment.events.length === 0 ? <div className="state-inline">{t('transporter.tracking.noEvents')}</div>
            : <ol className="tracking-timeline">{shipment.events.map((event) =>
              <li key={event.id}><span /><div><StatusBadge status={event.type} /><small>{date(event.createdAt)}</small></div></li>)}</ol>}
        </section>}
      </main>
      <aside className="shipment-action-panel">
        {shipment.vehicle && <>
          <h2>{t('transporter.details.vehicle')}</h2>
          <div className="vehicle-summary"><strong>{t(`transporter.vehicle.type.${shipment.vehicle.type}` as MessageKey)}</strong>
            <span>{shipment.vehicle.plateNumber}</span>
            <span>{shipment.vehicle.capacityKg == null ? t('common.notAvailable')
              : `${number(shipment.vehicle.capacityKg)} ${t('unit.KG')}`}</span>
          </div>
        </>}
        {shipment.ownOffer && <div className="own-offer"><span>{t('transporter.offer.yourOffer')}</span>
          <strong>{number(shipment.ownOffer.offeredPrice)} UZS</strong>
          <StatusBadge status={shipment.ownOffer.status} /></div>}
        {canOffer && activeVehicles.length === 0 && <VehicleRegistration
          requiredCapacityKg={shipment.load.requiredCapacityKg}
          onCreated={(vehicle) => { setVehicles((current) => [vehicle, ...current]); setVehicleId(vehicle.id); }}
        />}
        {canOffer && <form className="offer-form" onSubmit={(event) => void submitOffer(event)}>
          <h2>{t('transporter.offer.title')}</h2>
          <label>{t('transporter.offer.vehicle')}
            <select required value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
              <option value="">{t('transporter.offer.selectVehicle')}</option>
              {activeVehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>
                {t(`transporter.vehicle.type.${vehicle.type}` as MessageKey)} · {vehicle.plateNumber} · {number(vehicle.capacityKg)} {t('unit.KG')}
              </option>)}
            </select>
          </label>
          {quoteError && <div className="form-error" role="alert">{quoteError}
            <button className="button button-secondary" type="button"
              onClick={() => setQuoteAttempt((current) => current + 1)}>{t('common.retry')}</button>
          </div>}
          <div className="route-distance"><span>{t('transporter.offer.roadDistance')}</span>
            <strong>{quote ? `${number(quote.distanceKm)} km` : t('transporter.offer.distanceLoading')}</strong></div>
          {quote?.approximate && <p className="form-hint">{t('transporter.pricing.estimatedDistance')}</p>}
          <div className="route-distance"><span>{t('transporter.pricing.weight')}</span>
            <strong>{quote ? `${number(quote.weightKg)} kg` : '—'}</strong></div>
          <div className="route-distance"><span>{t('transporter.pricing.baseFare')}</span>
            <strong>{quote ? `${number(quote.baseFare)} UZS` : '—'}</strong></div>
          <div className="route-distance"><span>{t('transporter.pricing.roadRate')}</span>
            <strong>{quote ? `${number(quote.perRoadKm)} UZS/km` : '—'}</strong></div>
          <div className="route-distance"><span>{t('transporter.pricing.weightRate')}</span>
            <strong>{quote ? `${number(quote.perKg)} UZS/kg` : '—'}</strong></div>
          <div className="calculated-offer"><span>{t('transporter.offer.calculatedPrice')}</span>
            <strong>{quote === null ? '—' : `${number(quote.total)} UZS`}</strong></div>
          {activeVehicles.length === 0 && <p className="form-hint">{t('transporter.offer.noVehicles')}</p>}
          <button className="button button-primary button-full" type="submit"
            disabled={working || activeVehicles.length === 0 || quote === null}>
            {working ? t('transporter.offer.submitting') : t('transporter.offer.submit')}
          </button>
        </form>}
        {delivery && shipment.availableAction && <div className="delivery-action">
          <span>{t('transporter.action.next')}</span>
          <button className="button button-primary button-full" disabled={working}
            onClick={() => void transition(shipment.availableAction!)}>
            {working ? t('transporter.action.updating') : t(actionLabels[shipment.availableAction])}
          </button>
        </div>}
        {delivery && !shipment.availableAction && <div className="state-inline">{t('transporter.action.none')}</div>}
      </aside>
    </div>
  </div>;
}
