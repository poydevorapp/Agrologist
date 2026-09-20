import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type Location = {
  region: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
};

type Point = { latitude: number; longitude: number };

@Injectable()
export class RouteDistanceService {
  private readonly geocodeCache = new Map<string, Promise<Point>>();
  private geocodeQueue: Promise<unknown> = Promise.resolve();

  async calculate(origin: Location, destination: Location) {
    try {
      const [from, to] = await Promise.all([this.point(origin), this.point(destination)]);
      const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) throw new Error('Routing unavailable');
      const body = await response.json() as { routes?: Array<{ distance?: number }> };
      const meters = body.routes?.[0]?.distance;
      if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
        throw new Error('Route unavailable');
      }
      return {
        distanceKm: Math.round(meters / 10) / 100,
        approximate: origin.latitude === null || origin.longitude === null
          || destination.latitude === null || destination.longitude === null,
      };
    } catch {
      throw new ServiceUnavailableException('Road route is unavailable; retry when the map service is reachable');
    }
  }

  private point(location: Location): Promise<Point> {
    if (location.latitude !== null && location.longitude !== null
      && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
      return Promise.resolve({ latitude: location.latitude, longitude: location.longitude });
    }
    const query = [location.district, location.region, 'Uzbekistan'].filter(Boolean).join(', ');
    const cached = this.geocodeCache.get(query);
    if (cached) return cached;
    const request = this.geocodeQueue.then(async () => {
      const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', countrycodes: 'uz' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'AgrologistikMarketplaceDemo/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Geocoding unavailable');
      const body = await response.json() as Array<{ lat?: string; lon?: string }>;
      const latitude = Number(body[0]?.lat);
      const longitude = Number(body[0]?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        throw new Error('Location unavailable');
      }
      return { latitude, longitude };
    });
    const result = request.catch((error) => {
      this.geocodeCache.delete(query);
      throw error;
    });
    this.geocodeCache.set(query, result);
    this.geocodeQueue = result.catch(() => undefined).then(
      () => new Promise((resolve) => setTimeout(resolve, 1100)),
    );
    return result;
  }
}
