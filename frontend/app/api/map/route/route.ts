import { NextRequest } from 'next/server';

function point(value: string | null): [number, number] | null {
  if (!value || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) return null;
  const [lat, lon] = value.split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? [lat, lon] : null;
}

export async function GET(request: NextRequest) {
  const from = point(request.nextUrl.searchParams.get('from'));
  const to = point(request.nextUrl.searchParams.get('to'));
  if (!from || !to) return Response.json({ message: 'Invalid route points' }, { status: 400 });
  const coordinates = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  try {
    const upstream = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!upstream.ok) throw new Error('Routing unavailable');
    const payload = await upstream.json() as { routes?: Array<{ geometry?: { coordinates?: unknown } }> };
    const routeCoordinates = payload.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2 || routeCoordinates.length > 10000) {
      throw new Error('Invalid route');
    }
    return Response.json({ routes: [{ geometry: { coordinates: routeCoordinates } }] });
  } catch { return Response.json({ message: 'Route unavailable' }, { status: 503 }); }
}
