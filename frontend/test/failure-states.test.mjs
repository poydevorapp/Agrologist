import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';

// Exercise the actual browser client with controlled network/storage failures.
function client(fetchImpl, initialSession) {
  const storage = new Map(initialSession ? [['agrologistik.session', JSON.stringify(initialSession)]] : []);
  const listeners = new Map();
  const window = { localStorage: { getItem: () => 'uz-UZ' }, navigator: { language: 'uz-UZ' },
    sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    dispatchEvent: e => { for(const listener of listeners.get(e.type) ?? []) listener(e); },
    addEventListener: (type,fn) => listeners.set(type,[...(listeners.get(type) ?? []),fn]) };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = readFileSync(new URL('../' + file + '.ts', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    vm.runInNewContext(outputText, { exports, require: name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name))), window,
      process: { env: {} }, fetch: fetchImpl, Response, Headers, AbortSignal, Event, setTimeout, clearTimeout, console });
    cache.set(file,exports); return exports;
  }
  return { api: load('lib/api'), store: load('lib/session-store'), storage, window };
}
const session = { user: { id: 'test-user', fullName: 'Demo', phone: 'test', email: null, status: 'ACTIVE' },
  accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer', accessExpiresIn: 900, refreshExpiresIn: 6000 };

test('malformed successful JSON fails cleanly rather than returning null', async () => {
  for (const body of ['<html>upstream error</html>', 'null']) {
    const { api } = client(async () => new Response(body, { status: 200 }));
    await assert.rejects(api.apiRequest('/orders/my'), error => error.status === 502);
  }
});
test('refresh service outage preserves valid refresh credentials for retry', async () => {
  const { api, store } = client(async path => new Response('{}', { status: path.endsWith('/auth/refresh') ? 503 : 401 }), session);
  await assert.rejects(api.apiRequest('/orders/my'), error => error.status === 503);
  assert.equal(store.readSession()?.refreshToken, 'refresh');
});
test('invalid refresh is revoked locally; simultaneous requests rotate once', async () => {
  const invalid = client(async () => new Response('{}', { status: 401 }), session);
  await assert.rejects(invalid.api.apiRequest('/orders/my'), error => error.status === 401);
  assert.equal(invalid.store.readSession(), null);
  let rotations = 0;
  const c = client(async (path,init) => {
    if (path.endsWith('/auth/refresh')) { rotations++; await new Promise(r => setTimeout(r,5)); return Response.json({...session,accessToken:'new',refreshToken:'new-refresh'}); }
    return init.headers.get('Authorization') === 'Bearer new' ? Response.json([]) : new Response('{}',{status:401});
  },session);
  await Promise.all([c.api.apiRequest('/orders/my'),c.api.apiRequest('/orders/my')]);
  assert.equal(rotations,1);
  assert.equal(c.store.readSession()?.accessToken,'new');
});
test('corrupt stored session cannot crash the application shell', () => {
  const c = client(async () => Response.json({}), {});
  assert.equal(c.store.readSession(),null);
});

test('late unauthorized response reuses the already rotated session', async () => {
  let rotations = 0;
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const c = client(async (path, init) => {
    if (path.endsWith('/auth/refresh')) {
      rotations++;
      return rotations === 1 ? Response.json({ ...session, accessToken: 'new', refreshToken: 'new-refresh' }) : Response.json({}, { status: 401 });
    }
    if (init.headers.get('Authorization') === 'Bearer new') return Response.json([]);
    if (path.endsWith('/slow')) await delayed;
    return Response.json({}, { status: 401 });
  }, session);
  const slow = c.api.apiRequest('/slow');
  await c.api.apiRequest('/fast');
  release();
  await slow;
  assert.equal(rotations, 1);
  assert.equal(c.store.readSession()?.accessToken, 'new');
});

test('old refresh rejection cannot log out a newly signed-in account', async () => {
  let release;
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  const delayed = new Promise(resolve => { release = resolve; });
  const c = client(async path => {
    if (path.endsWith('/auth/refresh')) { started(); await delayed; }
    return Response.json({}, { status: 401 });
  }, session);
  const pending = c.api.apiRequest('/orders/my');
  await waiting;
  c.store.writeSession({ ...session, user: { ...session.user, id: 'other-user' }, refreshToken: 'other-refresh' });
  release();
  await assert.rejects(pending);
  assert.equal(c.store.readSession()?.refreshToken, 'other-refresh');
});
test('network errors and API validation errors propagate to screen error states', async () => {
  const offline = client(async () => { throw new TypeError('Network unavailable'); });
  await assert.rejects(offline.api.apiRequest('/orders/my'));
  const invalid = client(async () => Response.json({message:'Invalid UUID'}, {status:400}));
  await assert.rejects(invalid.api.apiRequest('/orders/bad'), error =>
    error.status === 400 && error.message === 'Kiritilgan ma’lumotlarni tekshiring.' && error.originalMessage === 'Invalid UUID');
});

test('browser API errors follow the selected language while retaining diagnostics', async () => {
  const c = client(async () => Response.json({ message: 'Invalid UUID' }, { status: 400 }));
  c.window.localStorage = { getItem: () => 'uz-UZ' };
  await assert.rejects(c.api.apiRequest('/orders/bad'), error =>
    error.status === 400 && error.message === 'Kiritilgan ma’lumotlarni tekshiring.' &&
    error.originalMessage === 'Invalid UUID');
});

test('browser API errors follow browser language before a locale is saved', async () => {
  const c = client(async () => Response.json({ message: 'Invalid UUID' }, { status: 400 }));
  c.window.localStorage = { getItem: () => null };
  c.window.navigator.language = 'ru-RU';
  await assert.rejects(c.api.apiRequest('/orders/bad'), error =>
    error.status === 400 && error.message !== error.originalMessage && error.message !== 'Kiritilgan ma’lumotlarni tekshiring.');
});

function mapNetwork(fetchImpl) {
  const file = readFileSync(new URL('../components/maps/shipment-map.tsx',import.meta.url),'utf8') + '\nexport { geocode, roadRoute };';
  const {outputText} = ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
  const exports = {};
  vm.runInNewContext(outputText,{exports,require:()=>({}),fetch:fetchImpl,URLSearchParams,AbortController,AbortSignal,
    setTimeout:(fn)=>setTimeout(fn,1),console});
  return exports;
}
test('map geocoding has a timeout and retry after service failure', async () => {
  let calls=0;
  const signals=[];
  const map=mapNetwork(async (url,init) => { assert.match(String(url), /^\/api\/map\/geocode\?/); signals.push(init.signal); calls++; return calls===1 ? Response.json({}, {status:503}) : Response.json([{lat:'41.3',lon:'69.2'}]); });
  const location={region:'Toshkent',district:'Qibray',latitude:null,longitude:null};
  assert.equal(await map.geocode(location),null);
  assert.ok(await map.geocode(location));
  assert.ok(signals.every(Boolean),'geocode must carry a bounded abort signal');
});
test('map routing failures use a straight-line fallback and have a timeout', async () => {
  const controller=new AbortController();
  let usedSignal;
  const map=mapNetwork(async (url,init) => { assert.match(String(url), /^\/api\/map\/route\?/); usedSignal=init.signal; return Response.json({routes:[{geometry:{coordinates:[['bad',999],[1,2]]}}]}); });
  assert.equal(await map.roadRoute([41.3,69.2],[41.4,69.3],controller.signal),null);
  assert.notEqual(usedSignal,controller.signal,'routing must also be time bounded');
});

test('transport offer distance uses the driving route kilometres, not a straight line', async () => {
  const file = readFileSync(new URL('../lib/road-distance.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  let requestedUrl = '';
  vm.runInNewContext(outputText, {
    exports, URLSearchParams, AbortSignal, setTimeout, console,
    fetch: async url => {
      requestedUrl = String(url);
      return Response.json({ routes: [{ distance: 12345 }] });
    },
  });
  const origin = { region: 'Toshkent', district: 'Chilonzor', latitude: 41.27, longitude: 69.2 };
  const destination = { region: 'Toshkent', district: 'Yunusobod', latitude: 41.36, longitude: 69.29 };
  const distance = await exports.calculateRoadDistanceKm(origin, destination, new AbortController().signal);
  assert.equal(distance, 12.35);
  assert.match(requestedUrl, /route\/v1\/driving/);
  assert.match(requestedUrl, /overview=false/);
});
