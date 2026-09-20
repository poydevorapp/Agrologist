'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { useI18n } from '@/components/locale-provider';
import { StatusBadge } from '@/components/farmer/status-badge';

export type MapLocation = {
  region: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
};

type Point = [number, number];
type Phase = 'loading' | 'ready' | 'error';

const geocodeCache = new Map<string, Promise<Point | null>>();
let geocodeQueue: Promise<unknown> = Promise.resolve();

function validPoint(location: MapLocation): Point | null {
  const { latitude, longitude } = location;
  return latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? [latitude, longitude]
    : null;
}

function geocode(location: MapLocation): Promise<Point | null> {
  const direct = validPoint(location);
  if (direct) return Promise.resolve(direct);
  const query = [location.district, location.region].filter(Boolean).join(', ');
  const cached = geocodeCache.get(query);
  if (cached) return cached;
  const request = geocodeQueue.then(async () => {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' });
    const response = await fetch(`/api/map/geocode?${params}`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const results = await response.json() as Array<{ lat: string; lon: string }>;
    const latitude = Number(results[0]?.lat);
    const longitude = Number(results[0]?.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      ? [latitude, longitude] as Point : null;
  }).then((point) => {
    if (!point) geocodeCache.delete(query);
    return point;
  }, () => {
    geocodeCache.delete(query);
    return null;
  });
  geocodeCache.set(query, request);
  geocodeQueue = request.catch(() => null).then(() => new Promise((resolve) => setTimeout(resolve, 1100)));
  return request;
}

async function roadRoute(origin: Point, destination: Point, signal: AbortSignal): Promise<Point[] | null> {
  try {
    const params = new URLSearchParams({ from: origin.join(','), to: destination.join(',') });
    const response = await fetch(`/api/map/route?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }> };
    const points = payload.routes?.[0]?.geometry?.coordinates?.map(([longitude, latitude]) => [latitude, longitude] as Point);
    return points && points.length > 1 && points.every(([latitude, longitude]) =>
      Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) ? points : null;
  } catch { return null; }
}

export function ShipmentMap({ origin, destination, status }: { origin: MapLocation; destination: MapLocation; status: string }) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [approximate, setApproximate] = useState(false);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let map: LeafletMap | null = null;
    setPhase('loading');
    setApproximate(false);
    setTilesUnavailable(false);

    void (async () => {
      try {
        const [originPoint, destinationPoint] = await Promise.all([
          geocode(origin), geocode(destination),
        ]);
        if (!originPoint || !destinationPoint) throw new Error('Location unavailable');
        const routed = await roadRoute(originPoint, destinationPoint, controller.signal);
        if (disposed || !container.current) return;
        const L = await import('leaflet');
        if (disposed || !container.current) return;
        const path = routed ?? [originPoint, destinationPoint];
        setApproximate(!routed || !validPoint(origin) || !validPoint(destination));
        map = L.map(container.current, { zoomControl: true, scrollWheelZoom: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).on('tileerror', () => { if (!disposed) setTilesUnavailable(true); }).addTo(map);
        L.polyline(path, { color: '#1f6b45', weight: 5, opacity: 0.85 }).addTo(map);
        L.circleMarker(originPoint, { radius: 9, color: '#164c33', fillColor: '#ffffff', fillOpacity: 1, weight: 4 })
          .addTo(map).bindTooltip(t('map.origin'));
        L.circleMarker(destinationPoint, { radius: 9, color: '#a66c16', fillColor: '#ffffff', fillOpacity: 1, weight: 4 })
          .addTo(map).bindTooltip(t('map.destination'));
        if (originPoint[0] === destinationPoint[0] && originPoint[1] === destinationPoint[1]) map.setView(originPoint, 13);
        else map.fitBounds(L.latLngBounds(path), { padding: [34, 34] });
        setPhase('ready');
      } catch {
        if (!disposed) setPhase('error');
      }
    })();

    return () => { disposed = true; controller.abort(); map?.remove(); };
  }, [origin.latitude, origin.longitude, origin.region, origin.district, destination.latitude, destination.longitude, destination.region, destination.district, attempt, t]);

  return <section className="shipment-map-card"><header><div><div className="eyebrow">{t('map.eyebrow')}</div><h2>{t('map.title')}</h2></div><StatusBadge status={status} /></header><div className="map-location-row"><div><span className="map-dot map-dot-origin" /> <span>{t('map.origin')}</span><strong>{origin.district}, {origin.region}</strong></div><div><span className="map-dot map-dot-destination" /> <span>{t('map.destination')}</span><strong>{destination.district}, {destination.region}</strong></div></div><div className="map-frame">{phase === 'loading' && <div className="map-state" role="status"><span className="spinner" />{t('map.loading')}</div>}{phase === 'error' && <div className="map-state map-error"><strong>{t('map.errorTitle')}</strong><span>{t('map.errorBody')}</span><div className="map-fallback-route"><span>{origin.district}, {origin.region}</span><span aria-hidden="true">→</span><span>{destination.district}, {destination.region}</span></div><button className="button button-secondary" type="button" onClick={() => setAttempt((value) => value + 1)}>{t('common.retry')}</button></div>}<div ref={container} className="leaflet-map" aria-label={t('map.ariaLabel')} /></div>{phase === 'ready' && <footer><span>{tilesUnavailable ? t('map.tilesUnavailable') : approximate ? t('map.approximateRoute') : t('map.roadRoute')}</span><span>{t('map.noLiveTracking')}</span></footer>}</section>;
}
