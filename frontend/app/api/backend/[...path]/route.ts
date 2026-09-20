import { NextRequest } from 'next/server';

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: Context): Promise<Response> {
  const backend = (process.env.BACKEND_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const { path } = await context.params;
  const target = `${backend}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const authorization = request.headers.get('authorization');
  if (contentType) headers.set('content-type', contentType);
  if (authorization) headers.set('authorization', authorization);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get('content-type');
    if (upstreamType) responseHeaders.set('content-type', upstreamType);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ message: 'Backend service is unavailable.' }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
