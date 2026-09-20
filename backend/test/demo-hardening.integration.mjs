// Run from backend: node --env-file=.env test/demo-hardening.integration.mjs
// All writes are confined to a random test schema, removed in finally.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DATABASE_POOL } from '../dist/database/database.service.js';
import { createValidationPipe } from '../dist/common/validation.js';

const schema = 'test_demo_hardening_' + randomUUID().replaceAll('-', '');
const connection = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000 };
assert.equal(connection.database, 'agro_marketplace', 'Run only against the local demo database');
const admin = new Pool(connection);
let pool, app, checks = 0;
const failures = [];
const check = (condition, label) => { checks++; if (!condition) failures.push(label); };
try {
  await admin.query('CREATE SCHEMA ' + schema);
  pool = new Pool({ ...connection, max: 12, options: '-c search_path=' + schema });
  for (const file of ['001_extensions.sql','002_identity.sql','003_marketplace.sql','004_orders.sql',
    '005_logistics.sql','006_payments.sql','007_reviews_disputes.sql','008_notifications_audit.sql',
    '009_indexes.sql','010_seed_demo.sql','011_auth.sql','012_demo_wallet.sql']) {
    await pool.query(await readFile(new URL('../../database/' + file, import.meta.url), 'utf8'));
  }
  const { AppModule } = await import('../dist/app.module.js');
  const { DatabaseModule } = await import('../dist/database/database.module.js');
  const { LogisticsModule } = await import('../dist/logistics/logistics.module.js');
  const { RouteDistanceService } = await import('../dist/logistics/route-distance.service.js');
  const providers = Reflect.getMetadata('providers', DatabaseModule);
  Module({ providers: providers.map(p => p.provide === DATABASE_POOL ? { provide: DATABASE_POOL, useValue: pool } : p) })(DatabaseModule);
  const logisticsProviders = Reflect.getMetadata('providers', LogisticsModule);
  Module({ providers: logisticsProviders.map(p => p === RouteDistanceService
    ? { provide: RouteDistanceService, useValue: { calculate: async () => ({ distanceKm: 33.44, approximate: false }) } }
    : p) })(LogisticsModule);
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.useGlobalPipes(createValidationPipe());
  await app.listen(process.env.DEMO_BROWSER === 'true' ? 3100 : 0, '127.0.0.1');
  const base = await app.getUrl();
  async function request(path, actor, method = 'GET', body, expected = 200) {
    const response = await fetch(base + path, { method,
      headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + actor.accessToken } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = response.status === 204 ? undefined : await response.json();
    check((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${method} ${path}: expected ${expected}, got ${response.status} (${data?.message ?? ''})`);
    return data;
  }
  await request('/health');
  const actors = {};
  await request('/auth/register', null, 'POST', {
    phone: 'test-' + randomUUID().slice(0,20), password: randomUUID(), fullName: 'Invalid Admin', roles: ['ADMIN'],
  }, 400);
  for (const role of ['FARMER','BUYER','TRANSPORTER','ADMIN','OTHER']) {
    const phone = 'test-' + randomUUID().slice(0,20), password = process.env.DEMO_BROWSER === 'true' ? 'Local-test-only-046!' : randomUUID();
    const user = await request('/auth/register', null, 'POST', {
      phone, password, fullName: 'Demo Test ' + role,
      ...(role === 'OTHER' ? { email: 'blocked-' + randomUUID() + '@example.test' } : {}),
      roles: [role === 'ADMIN' || role === 'OTHER' ? 'BUYER' : role],
      region: 'Toshkent', district: 'Qibray',
    }, 201);
    await request('/auth/login', null, 'POST', { identifier: phone, password: 'invalid-password' }, 401);
    actors[role] = await request('/auth/login', null, 'POST', { identifier: phone, password });
    actors[role].registrationRefreshToken = user.refreshToken;
    if (role === 'ADMIN') {
      await pool.query('DELETE FROM user_roles WHERE user_id=$1', [user.user.id]);
      await pool.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name=$2', [user.user.id, role]);
    }
    if (role === 'OTHER') await pool.query('DELETE FROM user_roles WHERE user_id=$1', [user.user.id]);
  }
  const farmer = actors.FARMER, buyer = actors.BUYER, transporter = actors.TRANSPORTER, administrator = actors.ADMIN;
  await request('/auth/me', null, 'GET', undefined, 401);
  const adminIdentity = await request('/auth/me', administrator);
  check(adminIdentity.roles.includes('ADMIN'), 'identity endpoint reads current admin role from database');
  const buyerIdentity = await request('/auth/me', buyer);
  check(buyerIdentity.roles.includes('BUYER') && !buyerIdentity.roles.includes('ADMIN'), 'buyer identity has no admin role');
  const rotated = await request('/auth/refresh', null, 'POST', { refreshToken: actors.OTHER.refreshToken });
  check(rotated.refreshToken !== actors.OTHER.refreshToken, 'refresh token rotates');
  await request('/auth/refresh', null, 'POST', { refreshToken: actors.OTHER.refreshToken }, 401);
  await request('/auth/logout', null, 'POST', { refreshToken: rotated.refreshToken }, 204);
  await request('/auth/refresh', null, 'POST', { refreshToken: rotated.refreshToken }, 401);
  for (const [role, table] of [['FARMER', 'farmer_profiles'], ['BUYER', 'buyer_profiles'], ['TRANSPORTER', 'transporter_profiles']]) {
    const result = await pool.query('SELECT 1 FROM ' + table + ' WHERE user_id=$1', [actors[role].user.id]);
    check(result.rowCount === 1, role + ' profile created during registration');
  }
  const multi = await request('/auth/register', null, 'POST', {
    phone: 'test-' + randomUUID().slice(0, 20), password: randomUUID(), fullName: 'Multi Role Demo',
    roles: ['FARMER', 'BUYER', 'TRANSPORTER'], region: 'Toshkent', district: 'Qibray',
  }, 201);
  const multiRoles = await pool.query(
    'SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 ORDER BY r.name',
    [multi.user.id],
  );
  check(multiRoles.rows.map((row) => row.name).join(',') === 'BUYER,FARMER,TRANSPORTER',
    'multi-role registration assigns exactly chosen roles');
  for (const table of ['farmer_profiles', 'buyer_profiles', 'transporter_profiles']) {
    const profile = await pool.query('SELECT 1 FROM ' + table + ' WHERE user_id=$1', [multi.user.id]);
    check(profile.rowCount === 1, 'multi-role registration creates ' + table);
  }
  await pool.query("UPDATE transporter_profiles SET availability_status='AVAILABLE' WHERE user_id=$1", [transporter.user.id]);
  check((await request('/transport/vehicles', transporter)).length === 0, 'new transporter starts without a vehicle');
  const vehicleInput = { vehicle_type: 'TRUCK', plate_number: schema.slice(-12), capacity_kg: 5000, refrigerated: false };
  await request('/transport/vehicles', buyer, 'POST', vehicleInput, 403);
  await request('/transport/vehicles', transporter, 'POST', { ...vehicleInput, transporter_id: farmer.user.id }, 400);
  await request('/transport/vehicles', transporter, 'POST', { ...vehicleInput, capacity_kg: 0 }, 400);
  const vehicle = await request('/transport/vehicles', transporter, 'POST', vehicleInput, 201);
  check(vehicle.status === 'ACTIVE' && vehicle.capacityKg === 5000, 'transporter can register an active vehicle');
  await request('/transport/vehicles', transporter, 'POST', vehicleInput, 409);
  check((await request('/transport/vehicles', transporter)).some(row => row.id === vehicle.id),
    'registered vehicle is selectable for an offer');
  for (const [path, actor] of [['/listings/my',farmer],['/marketplace/listings',buyer],['/transport/available',transporter],['/admin/users',administrator]]) {
    await request(path, actor);
    await request(path, null, 'GET', undefined, 401);
    await request(path, { accessToken: 'invalid.jwt.token' }, 'GET', undefined, 401);
    await request(path, actors.OTHER, 'GET', undefined, 403);
  }
  await request('/listings/not-a-uuid', farmer, 'GET', undefined, 400);
  await request('/listings/' + randomUUID(), farmer, 'GET', undefined, 404);
  check((await request('/orders/my', buyer)).length === 0, 'empty buyer orders');
  const catalog = await request('/listings/catalog', farmer);
  const product = catalog.categories.flatMap(c => c.products).find(p => p.unit === 'KG');
  const input = { productId: product.id, title: 'Demo test potatoes', quantity: 20, unit: 'KG', pricePerUnit: 4500,
    region: 'Toshkent', district: 'Qibray', latitude: 41.389, longitude: 69.465 };
  await request('/listings', farmer, 'POST', { ...input, title: '   ' }, 400);
  await request('/listings', buyer, 'POST', input, 403);
  const listing = await request('/listings', farmer, 'POST', input, 201);
  check(listing.status === 'PENDING', 'new listing must be reachable by moderation (currently ' + listing.status + ')');
  await request('/listings/' + listing.id, farmer, 'PATCH', { pricePerUnit: 5000 });
  await request('/listings/' + listing.id, farmer, 'PATCH', {}, 400);
  await request('/listings/' + listing.id, farmer, 'PATCH', { latitude: 41 }, 400);
  await request('/listings/' + listing.id, farmer);
  const cancelled = await request('/listings', farmer, 'POST', input, 201);
  await request('/listings/' + cancelled.id + '/cancel', farmer, 'POST', undefined, 201);
  await request('/listings/' + cancelled.id + '/cancel', farmer, 'POST', undefined, 409);
  await request('/listings/' + cancelled.id, farmer, 'PATCH', { title: 'invalid edit' }, 409);
  await request('/admin/listings/' + listing.id + '/approve', buyer, 'POST', {}, 403);
  await request('/admin/listings/' + listing.id + '/approve', administrator, 'POST', {}, 201);
  await request('/admin/listings/' + listing.id + '/approve', administrator, 'POST', {}, 409);
  const rejected = await request('/listings', farmer, 'POST', input, 201);
  await request('/admin/listings/' + rejected.id + '/reject', administrator, 'POST', { reason: 'Demo rejection' }, 201);
  const page = await request('/marketplace/listings?product_id=' + product.id + '&region=Toshkent&min_price=100&max_price=6000&page=1&page_size=100', buyer);
  check(page.data.some(row => row.id === listing.id), 'approved listing visible in filtered marketplace');
  await request('/marketplace/listings/' + listing.id, buyer);
  await request('/marketplace/listings?product_id=invalid', buyer, 'GET', undefined, 400);
  await request('/orders', buyer, 'POST', { listing_id: listing.id, quantity: 0 }, 400);
  await request('/orders', buyer, 'POST', { listing_id: listing.id, quantity: 21 }, 409);
  const order = await request('/orders', buyer, 'POST', { listing_id: listing.id, quantity: 10 }, 201);
  check(order.totalAmount === 50000 && order.status === 'PENDING', 'server price snapshot and initial order state');
  await request('/orders/' + order.id, buyer);
  await request('/orders/farmer', farmer);
  const action = (name, expected = 201) => request('/orders/' + order.id + '/actions/' + name, farmer, 'POST', {}, expected);
  await action('MARK_DELIVERED', 403);
  await action('REQUEST_TRANSPORT', 409);
  await action('CONFIRM');
  check((await request('/orders/' + order.id,buyer)).availableActions.demoPay === false, 'payment action waits for agreed delivery fee');
  await action('CONFIRM', 409);
  await action('REQUEST_TRANSPORT');
  const shipment = (await pool.query('SELECT id FROM shipments WHERE order_id=$1', [order.id])).rows[0];
  check(Boolean(shipment), 'REQUEST_TRANSPORT must create discoverable shipment');
  assert.ok(shipment, 'transport request did not create shipment');
  const available = await request('/transport/available?page_size=100', transporter);
  check(available.data.some(s => s.shipmentId === shipment.id), 'shipment visible for transporter');
  await request('/transport/shipments/' + shipment.id, transporter);
  const otherVehicle = (await pool.query('SELECT id FROM vehicles WHERE transporter_id <> $1 LIMIT 1', [transporter.user.id])).rows[0];
  const quotePath = '/transport/shipments/' + shipment.id + '/quote?vehicle_id=' + vehicle.id;
  const quote = await request(quotePath, transporter);
  check(quote.distanceKm === 33.44 && quote.weightKg === 10 && quote.total === 70342 &&
    quote.vehicleId === vehicle.id && quote.vehicleType === 'TRUCK',
    'server calculates transparent vehicle, road and weight price');
  await request(quotePath, buyer, 'GET', undefined, 403);
  await request('/transport/shipments/' + shipment.id + '/quote', transporter, 'GET', undefined, 400);
  await request('/transport/shipments/' + shipment.id + '/quote?vehicle_id=' + otherVehicle.id, transporter, 'GET', undefined, 404);
  await request('/transport/offers', transporter, 'POST',
    { shipment_id: shipment.id, vehicle_id: vehicle.id, offered_price: 1 }, 400);
  await request('/transport/offers', transporter, 'POST', { shipment_id: shipment.id, vehicle_id: otherVehicle.id }, 404);
  const tooSmall = (await pool.query("INSERT INTO vehicles(transporter_id,vehicle_type,plate_number,capacity_kg,status) VALUES($1,'PICKUP',$2,1,'ACTIVE') RETURNING id", [transporter.user.id,schema+'-small'])).rows[0];
  await request('/transport/shipments/' + shipment.id + '/quote?vehicle_id=' + tooSmall.id, transporter, 'GET', undefined, 409);
  const pickup = (await pool.query("INSERT INTO vehicles(transporter_id,vehicle_type,plate_number,capacity_kg,status) VALUES($1,'PICKUP',$2,1000,'ACTIVE') RETURNING id", [transporter.user.id,schema+'-pickup'])).rows[0];
  const pickupQuote = await request('/transport/shipments/' + shipment.id + '/quote?vehicle_id=' + pickup.id, transporter);
  check(pickupQuote.total === 60260 && pickupQuote.total < quote.total && pickupQuote.vehicleType === 'PICKUP',
    'eligible pickup uses its own lower demo tariff');
  await request('/transport/offers',transporter,'POST',{shipment_id:shipment.id,vehicle_id:tooSmall.id},409);
  const offer = await request('/transport/offers', transporter, 'POST', { shipment_id: shipment.id, vehicle_id: vehicle.id }, 201);
  check(offer.offeredPrice === quote.total, 'offer uses server quote, not transporter-supplied amount');
  await request('/transport/offers', transporter, 'POST', { shipment_id: shipment.id, vehicle_id: vehicle.id }, 409);
  const farmerOffers = await request('/orders/' + order.id + '/transport-offers', farmer);
  check(farmerOffers.offers.some(row => row.id === offer.id), 'farmer can load pending offers for own order');
  await request('/orders/' + order.id + '/transport-offers', buyer, 'GET', undefined, 403);
  await request('/transport/offers/' + offer.id + '/accept', buyer, 'POST', {}, 403);
  const accepted = await Promise.all([1,2].map(() => request('/transport/offers/' + offer.id + '/accept', farmer, 'POST', {}, [201,409])));
  // Concurrent requests have one winner and one conflict; inspect committed state independently.
  check(accepted.filter(r => r.shipment?.status === 'ASSIGNED').length === 1, 'one concurrent acceptance winner');
  const assignedOrder = await request('/orders/' + order.id, buyer);
  check(assignedOrder.availableActions.demoPay === true, 'payment action enabled after assignment');
  const expectedTotal = 50000 + quote.total;
  const expectedFee = Math.round(expectedTotal * 0.003 * 100) / 100;
  const expectedPayable = expectedTotal + expectedFee;
  check(assignedOrder.deliveryFee === quote.total && assignedOrder.totalAmount === expectedTotal, 'accepted transport price must reach order/escrow total');
  check(assignedOrder.demoPaymentQuote.platformFee === expectedFee && assignedOrder.demoPaymentQuote.payableTotal === expectedPayable,
    '0.3% demo fee is added to buyer total by the server');
  const emptyTurnover = await request('/admin/turnover', administrator);
  check(Number(emptyTurnover.amount) === 0 && emptyTurnover.paidOrders === 0,
    'admin turnover excludes unpaid orders and wallet top-ups');
  await request('/admin/turnover', buyer, 'GET', undefined, 403);
  const emptyAnalytics = await request('/admin/turnover-analytics', administrator);
  check(emptyAnalytics.daily.length === 30 && emptyAnalytics.monthly.length === 12 &&
    emptyAnalytics.weekly.length === 7 && Number(emptyAnalytics.breakdown.goods) === 0,
  'admin analytics includes empty calendar periods');
  await request('/admin/turnover-analytics', buyer, 'GET', undefined, 403);
  check((await request('/listings/sales-insights', farmer)).products.length === 0,
    'farmer sales exclude open orders');
  await request('/listings/sales-insights', buyer, 'GET', undefined, 403);
  check((await request('/wallet', buyer)).balance === 0, 'demo wallet starts at zero');
  const topupId = randomUUID();
  await request('/wallet/demo-top-up', buyer, 'POST', { amount: 200000, operationId: topupId }, 200);
  check((await request('/wallet', buyer)).balance === 200000, 'demo top-up credits virtual balance');
  await request('/wallet/demo-top-up', buyer, 'POST', { amount: 200000, operationId: topupId }, 200);
  check((await request('/wallet', buyer)).balance === 200000, 'top-up retry does not duplicate balance');
  await request('/wallet/demo-top-up', buyer, 'POST', { amount: 900000000, operationId: randomUUID() }, 409);
  await request('/wallet/demo-cash-out', buyer, 'POST', { amount: 200001, operationId: randomUUID() }, 409);
  const pay = () => request('/orders/' + order.id + '/demo-pay', buyer, 'POST', {});
  const payments = await Promise.all([pay(),pay(),pay()]);
  check(payments.every(p => p.payment.id === payments[0].payment.id), 'concurrent demo payment idempotency');
  check(Number(payments[0].payment.amount) === expectedPayable, 'buyer paid order total plus 0.3% fee');
  const paidTurnover = await request('/admin/turnover', administrator);
  check(Number(paidTurnover.amount) === expectedPayable && paidTurnover.paidOrders === 1,
    'admin turnover includes one successful buyer payment, including the platform fee');
  const paidAnalytics = await request('/admin/turnover-analytics', administrator);
  check(Number(paidAnalytics.daily.at(-1).amount) === expectedPayable &&
    Number(paidAnalytics.monthly.at(-1).amount) === expectedPayable &&
    Number(paidAnalytics.breakdown.goods) === 50000 &&
    Number(paidAnalytics.breakdown.delivery) === quote.total &&
    Number(paidAnalytics.breakdown.platformFee) === expectedFee,
  'admin charts reconcile buyer payment to product, delivery, and fee');
  check((await request('/listings/sales-insights', farmer)).products.length === 0,
    'farmer sales exclude paid but unfinished orders');
  check((await request('/wallet', buyer)).balance === 200000 - expectedPayable, 'demo payment debits buyer once');
  await request('/shipments/' + shipment.id + '/delivered', transporter, 'POST', {}, 409);
  await request('/shipments/' + shipment.id + '/picked-up', transporter, 'POST', {}, 201);
  await request('/shipments/' + shipment.id + '/picked-up', transporter, 'POST', {}, 409);
  await request('/shipments/' + shipment.id + '/in-transit', transporter, 'POST', {}, 201);
  const tracking = await request('/transport/shipments/' + shipment.id, transporter);
  check(tracking.pickup.latitude === 41.389 && Boolean(tracking.destination.district), 'transporter map coordinates/fallback contract: ' + JSON.stringify(tracking.pickup));
  await request('/shipments/' + shipment.id + '/delivered', transporter, 'POST', {}, 201);
  const delivered = await request('/orders/' + order.id, buyer);
  check(delivered.shipment.pickup.latitude === 41.389 && Boolean(delivered.shipment.destination.district), 'buyer map coordinates/fallback contract: ' + JSON.stringify(delivered.shipment.pickup));
  const release = () => request('/orders/' + order.id + '/accept-delivery', buyer, 'POST', {});
  const releases = await Promise.all([release(),release(),release()]);
  check(releases.every(r => r.escrow.status === 'RELEASED'), 'concurrent delivery acceptance releases once');
  check((await request('/wallet', farmer)).balance === 50000, 'farmer receives full goods subtotal');
  check((await request('/wallet', transporter)).balance === quote.total, 'transporter receives full delivery fee');
  check((await request('/admin/platform-wallet', administrator)).balance === expectedFee, 'shared admin platform wallet receives 0.3% fee once');
  await request('/admin/platform-wallet', buyer, 'GET', undefined, 403);
  await pay();
  check((await request('/wallet', buyer)).balance === 200000 - expectedPayable, 'payment retry after release does not debit again');
  const retriedTurnover = await request('/admin/turnover', administrator);
  check(Number(retriedTurnover.amount) === expectedPayable && retriedTurnover.paidOrders === 1,
    'payment retries do not inflate admin turnover');
  const ledger = (await pool.query('SELECT entry_type, amount FROM financial_ledger WHERE order_id=$1', [order.id])).rows;
  check(ledger.filter(e => e.entry_type === 'TRANSPORTER_PAYOUT').length === 1, 'nonzero transport payout recorded once');
  check((await request('/orders/' + order.id, buyer)).status === 'COMPLETED', 'main flow completed');
  const farmerSales = await request('/listings/sales-insights', farmer);
  check(farmerSales.products.length === 1 && farmerSales.products[0].productId === product.id &&
    Number(farmerSales.products[0].quantity) === 10 && Number(farmerSales.products[0].revenue) === 50000 &&
    farmerSales.products[0].orderCount === 1,
  'farmer sales rank only own completed paid product sales');
  for (const route of ['users','listings','orders','shipments','disputes']) await request('/admin/' + route + '?page=1&page_size=5', administrator);
  // A generic status route cannot skip shipment assignment; funded cancellation cannot strand escrow.
  const detached = (await pool.query("INSERT INTO orders(buyer_id,farmer_id,status,subtotal,total_amount) VALUES($1,$2,'TRANSPORT_PENDING',100,100) RETURNING id", [buyer.user.id,farmer.user.id])).rows[0];
  await request('/orders/' + detached.id + '/actions/ASSIGN_TRANSPORT', administrator, 'POST', {}, 409);
  const funded = await request('/orders', buyer, 'POST', {listing_id:listing.id,quantity:1},201);
  await request('/orders/' + funded.id + '/actions/CONFIRM',farmer,'POST',{},201);
  await request('/orders/' + funded.id + '/demo-pay',buyer,'POST',{});
  await request('/orders/' + funded.id + '/actions/CANCEL',buyer,'POST',{},409);
  await request('/orders/' + funded.id + '/actions/REQUEST_TRANSPORT',farmer,'POST',{},201);
  const fundedShipment=(await pool.query('SELECT id FROM shipments WHERE order_id=$1',[funded.id])).rows[0];
  const fundedOffer=await request('/transport/offers',transporter,'POST',{shipment_id:fundedShipment.id,vehicle_id:vehicle.id},201);
  await request('/transport/offers/'+fundedOffer.id+'/accept',farmer,'POST',{},409);
  check((await request('/orders/'+funded.id,buyer)).totalAmount===5000,'failed price change preserves funded order amount');
  const lastStock = await request('/listings',farmer,'POST',{...input,quantity:1},201);
  await request('/admin/listings/'+lastStock.id+'/approve',administrator,'POST',{},201);
  await pool.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name='BUYER'", [actors.OTHER.user.id]);
  const racing = await Promise.all([buyer,actors.OTHER].map(actor=>request('/orders',actor,'POST',{listing_id:lastStock.id,quantity:1},[201,409])));
  check(racing.filter(r=>r.id).length===1,'two buyers racing for final stock: only one order succeeds');
  check((await pool.query('SELECT available_quantity FROM listings WHERE id=$1',[lastStock.id])).rows[0].available_quantity==='0.00','stock never negative');
  const bannedId = actors.OTHER.user.id;
  await request('/admin/users/' + bannedId + '/ban', buyer, 'POST', {}, 403);
  await request('/admin/users/not-a-uuid/ban', administrator, 'POST', {}, 400);
  await request('/admin/users/' + administrator.user.id + '/ban', administrator, 'POST', {}, 403);
  const banned = await request('/admin/users/' + bannedId + '/ban', administrator, 'POST', {}, 201);
  check(banned.status === 'SUSPENDED', 'admin ban suspends account');
  await request('/admin/users/' + bannedId + '/ban', administrator, 'POST', {}, 201);
  await request('/auth/me', actors.OTHER, 'GET', undefined, 401);
  await request('/auth/refresh', null, 'POST', { refreshToken: actors.OTHER.registrationRefreshToken }, 401);
  await request('/auth/register', null, 'POST', {
    phone: actors.OTHER.user.phone, password: randomUUID(), fullName: 'Recreated user',
    roles: ['BUYER'], region: 'Toshkent', district: 'Qibray',
  }, 409);
  await request('/auth/register', null, 'POST', {
    phone: 'test-' + randomUUID().slice(0, 20), email: actors.OTHER.user.email,
    password: randomUUID(), fullName: 'Recreated email',
    roles: ['BUYER'], region: 'Toshkent', district: 'Qibray',
  }, 409);
  check((await pool.query("SELECT count(*) AS count FROM audit_logs WHERE action='USER_BANNED' AND entity_id=$1", [bannedId])).rows[0].count === '1',
    'repeat ban creates only one audit event');
  if (process.env.DEMO_BROWSER === 'true') {
    console.log(JSON.stringify({browserFixture:{base, orderId:order.id, shipmentId:shipment.id,
      actors:Object.fromEntries(Object.entries(actors).map(([role,actor])=>[role,actor.user.phone]))}}));
    console.log('Browser fixture ready for up to 10 minutes. Press Enter to finish and remove its test schema.');
    await new Promise(resolve => {
      const finish = () => { clearTimeout(timer); process.stdin.off('data',finish); process.off('SIGINT',finish); resolve(); };
      const timer = setTimeout(finish, 600000);
      process.stdin.once('data',finish);
      process.once('SIGINT',finish);
    });
  }
  // Fail this test pool's queries only, never stop the user's PostgreSQL server.
  const originalQuery = pool.query;
  pool.query = () => Promise.reject(new Error('Injected database unavailable'));
  await request('/health', null, 'GET', undefined, 503);
  pool.query = originalQuery;
  console.log(JSON.stringify({ checks, failures, schema, mainFlow: 'FARMER -> BUYER -> TRANSPORTER -> ESCROW -> ADMIN' }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  if (app) await app.close();
  else if (pool) await pool.end();
  assert.match(schema, /^test_demo_hardening_[a-f0-9]{32}$/);
  await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
  await admin.end();
}
