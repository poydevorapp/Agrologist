import { NextRequest } from 'next/server';

const cache = new Map<string, { lat: number; lon: number }>();
let queue: Promise<unknown> = Promise.resolve();

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!query || query.length > 200) return Response.json({ message: 'Invalid location' }, { status: 400 });
  const cached = cache.get(query);
  if (cached) return Response.json([cached]);

  const task = queue.then(async () => {
    const params = new URLSearchParams({ q: `${query}, Uzbekistan`, format: 'jsonv2', limit: '1', countrycodes: 'uz' });
    const upstream = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AgrologistikMarketplaceDemo/1.0' },
      signal: AbortSignal.timeout(9000),
    });
    if (!upstream.ok) throw new Error('Geocoding unavailable');
    const results = await upstream.json() as Array<{ lat?: string; lon?: string }>;
    const lat = Number(results[0]?.lat);
    const lon = Number(results[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error('Location unavailable');
    }
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(query, { lat, lon });
    return { lat, lon };
  });
  queue = task.catch(() => undefined).then(() => new Promise(resolve => setTimeout(resolve, 1100)));
  try { return Response.json([await task]); }
  catch { return Response.json({ message: 'Location unavailable' }, { status: 503 }); }
}
