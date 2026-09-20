export type RouteLocation = {
  region: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
};

type Point = [number, number];

const geocodeCache = new Map<string, Promise<Point>>();
let geocodeQueue: Promise<unknown> = Promise.resolve();

function directPoint(location: RouteLocation): Point | null {
  const { latitude, longitude } = location;
  return latitude !== null && longitude !== null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? [latitude, longitude]
    : null;
}

function resolvePoint(location: RouteLocation, signal: AbortSignal): Promise<Point> {
  const direct = directPoint(location);
  if (direct) return Promise.resolve(direct);

  const query = [location.district, location.region].filter(Boolean).join(', ');
  if (!query) return Promise.reject(new Error('Location unavailable'));
  const cached = geocodeCache.get(query);
  if (cached) return cached;

  const request = geocodeQueue.then(async () => {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok) throw new Error('Geocoding unavailable');
    const results = await response.json() as Array<{ lat?: string; lon?: string }>;
    const latitude = Number(results[0]?.lat);
    const longitude = Number(results[0]?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error('Location unavailable');
    }
    return [latitude, longitude] as Point;
  });

  const cachedRequest = request.catch((error) => {
    geocodeCache.delete(query);
    throw error;
  });
  geocodeCache.set(query, cachedRequest);
  geocodeQueue = cachedRequest.catch(() => undefined).then(
    () => new Promise((resolve) => setTimeout(resolve, 1100)),
  );
  return cachedRequest;
}

export async function calculateRoadDistanceKm(
  origin: RouteLocation,
  destination: RouteLocation,
  signal: AbortSignal,
): Promise<number> {
  const [from, to] = await Promise.all([
    resolvePoint(origin, signal),
    resolvePoint(destination, signal),
  ]);
  const coordinates = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`,
    { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
  );
  if (!response.ok) throw new Error('Routing unavailable');
  const payload = await response.json() as { routes?: Array<{ distance?: number }> };
  const distanceMeters = payload.routes?.[0]?.distance;
  if (!Number.isFinite(distanceMeters) || (distanceMeters ?? 0) <= 0) {
    throw new Error('Route unavailable');
  }
  return Math.round((distanceMeters! / 1000) * 100) / 100;
}
