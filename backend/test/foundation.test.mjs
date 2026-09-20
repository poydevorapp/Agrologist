import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IsString } from 'class-validator';
import { validateEnvironment } from '../dist/config/environment.js';
import { DatabaseService, DATABASE_POOL } from '../dist/database/database.service.js';
import { createValidationPipe } from '../dist/common/validation.js';

test('environment converts numbers/boolean and rejects missing secrets and invalid ports', () => {
  const valid = {
    DB_USER: 'demo',
    DB_PASSWORD: 'test-only',
    DB_SSL: 'false',
    JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-32-characters',
    JWT_REFRESH_SECRET: 'test-refresh-secret-with-at-least-32-characters',
  };
  const config = validateEnvironment(valid);
  assert.equal(config.DB_PORT, 5432);
  assert.equal(config.DB_SSL, false);
  assert.deepEqual(config.CORS_ORIGINS, ['http://localhost:3001']);
  for (const bad of [{ ...valid, DB_PASSWORD: '' }, { ...valid, PORT: 'abc' },
    { ...valid, PORT: 65536 }, { ...valid, DB_SSL: 'no' }, { ...valid, CORS_ORIGIN: '*' }]) {
    assert.throws(() => validateEnvironment(bad));
  }
  const hosted = validateEnvironment({
    DATABASE_URL: 'postgresql://demo:secret@database.example/agro',
    DB_SSL: 'true',
    CORS_ORIGIN: 'https://agrologistik.vercel.app,https://demo.example',
    JWT_ACCESS_SECRET: valid.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: valid.JWT_REFRESH_SECRET,
  });
  assert.equal(hosted.DATABASE_URL, 'postgresql://demo:secret@database.example/agro');
  assert.equal(hosted.DB_USER, undefined);
  assert.equal(hosted.DB_SSL, true);
  assert.deepEqual(hosted.CORS_ORIGINS, ['https://agrologistik.vercel.app', 'https://demo.example']);
});

test('startup error identifies an occupied backend port without blaming PostgreSQL', async () => {
  const { startupErrorMessage } = await import('../dist/config/startup-error.js');
  const message = startupErrorMessage(Object.assign(new Error('occupied'), { code: 'EADDRINUSE' }), '127.0.0.1', 3000);
  assert.match(message, /127\.0\.0\.1:3000 is already in use/);
  assert.match(message, /\/health/);
  assert.doesNotMatch(message, /database connectivity/);
});

function database(failRollback = false) {
  const commands = [];
  const releases = [];
  const client = {
    query: async (sql) => {
      commands.push(sql);
      if (sql === 'ROLLBACK' && failRollback) throw new Error('connection lost');
      return { rows: [] };
    },
    release: (broken) => releases.push(broken),
  };
  const pool = { on() {}, connect: async () => client };
  return { service: new DatabaseService(pool), client, commands, releases };
}

test('transaction uses one client, commits and releases', async () => {
  const db = database();
  const result = await db.service.transaction(async (client) => {
    assert.equal(client, db.client);
    await client.query('SELECT 1');
    return 7;
  });
  assert.equal(result, 7);
  assert.deepEqual(db.commands, ['BEGIN', 'SELECT 1', 'COMMIT']);
  assert.deepEqual(db.releases, [false]);
});

test('transaction rolls back on error; destroys client if rollback also fails', async () => {
  for (const failRollback of [false, true]) {
    const db = database(failRollback);
    const failure = new Error('failed operation');
    await assert.rejects(db.service.transaction(async () => { throw failure; }), (e) => e === failure);
    assert.deepEqual(db.commands, ['BEGIN', 'ROLLBACK']);
    assert.deepEqual(db.releases, [failRollback]);
  }
});

test('validation rejects extra fields and returns a DTO instance', async () => {
  class ExampleDto {}
  IsString()(ExampleDto.prototype, 'name');
  const pipe = createValidationPipe();
  const metadata = { type: 'body', metatype: ExampleDto };
  assert.ok(await pipe.transform({ name: 'demo' }, metadata) instanceof ExampleDto);
  await assert.rejects(pipe.transform({ name: 'demo', extra: true }, metadata));
  await assert.rejects(pipe.transform({ name: 42 }, metadata));
});

test('all modules bootstrap and the public health route remains available', async () => {
  process.env.DB_USER = 'demo';
  process.env.DB_PASSWORD = 'test-only';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-at-least-32-characters';
  const { Module } = await import('@nestjs/common');
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { DatabaseModule } = await import('../dist/database/database.module.js');
  // Swap only the driver provider; the real service lifecycle and module wiring run.
  const providers = Reflect.getMetadata('providers', DatabaseModule);
  let ended = false;
  const fakePool = {
    on() {},
    query: async (sql) => sql === 'SELECT version() AS version'
      ? { rows: [{ version: 'PostgreSQL 18.4 (test)' }] }
      : { rows: [{ database: 'agro_marketplace', version: '180004' }] },
    end: async () => { ended = true; },
  };
  Module({ providers: providers.map(p => p.provide === DATABASE_POOL ?
    { provide: DATABASE_POOL, useValue: fakePool } : p) })(DatabaseModule);
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(await app.getUrl());
    assert.equal(response.status, 404);
    const health = await fetch(`${await app.getUrl()}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: 'ok',
      application: { status: 'up' },
      database: { status: 'up', version: 'PostgreSQL 18.4 (test)' },
    });
  } finally {
    await app.close();
    assert.equal(ended, true);
  }
});

function httpContext(request, handler = () => {}, controller = class TestController {}) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

test('access-token subject becomes identity while roles are loaded from database', async () => {
  const { Reflector } = await import('@nestjs/core');
  const { TokenService } = await import('../dist/auth/token.service.js');
  const { JwtAuthenticationGuard } = await import('../dist/authorization/jwt-authentication.guard.js');
  const values = {
    JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-32-characters',
    JWT_REFRESH_SECRET: 'test-refresh-secret-with-at-least-32-characters',
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 604800,
  };
  const config = { getOrThrow: (key) => values[key] };
  const tokens = new TokenService(config);
  const userId = '11111111-1111-4111-8111-111111111111';
  const database = {
    query: async (_sql, params) => {
      assert.deepEqual(params, [userId]);
      return { rows: [{ id: userId, phone: '+998900000001', email: null,
        full_name: 'Farmer', roles: ['FARMER'] }] };
    },
  };
  const request = { headers: { authorization: `Bearer ${tokens.signAccess(userId)}` }, params: {} };
  const guard = new JwtAuthenticationGuard(new Reflector(), tokens, database);
  assert.equal(await guard.canActivate(httpContext(request)), true);
  assert.deepEqual(request.user.roles, ['FARMER']);
  assert.equal(request.user.id, userId);
});

test('role guard allows each declared role and rejects a different role', async () => {
  const { Reflector } = await import('@nestjs/core');
  const { Roles } = await import('../dist/authorization/authorization.decorators.js');
  const { RolesGuard } = await import('../dist/authorization/roles.guard.js');
  const guard = new RolesGuard(new Reflector());
  for (const role of ['FARMER', 'BUYER', 'TRANSPORTER', 'ADMIN']) {
    const handler = () => {};
    Roles(role)(handler);
    const ownRequest = { headers: {}, params: {}, user: { id: 'user', roles: [role] } };
    assert.equal(guard.canActivate(httpContext(ownRequest, handler)), true);
    const otherRequest = { headers: {}, params: {}, user: { id: 'user', roles: ['BUYER'] } };
    if (role !== 'BUYER') assert.throws(() => guard.canActivate(httpContext(otherRequest, handler)), /Insufficient role/);
  }
});

test('resource ownership uses authenticated user and conceals foreign resources', async () => {
  const { Reflector } = await import('@nestjs/core');
  const { ResourceOwner } = await import('../dist/authorization/authorization.decorators.js');
  const { OwnershipService } = await import('../dist/authorization/ownership.service.js');
  const { ResourceOwnerGuard } = await import('../dist/authorization/resource-owner.guard.js');
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const ownListing = '22222222-2222-4222-8222-222222222222';
  const foreignListing = '33333333-3333-4333-8333-333333333333';
  const database = {
    query: async (_sql, params) => ({ rowCount: params[0] === ownListing && params[1] === ownerId ? 1 : 0 }),
  };
  const handler = () => {};
  ResourceOwner('LISTING', 'listingId')(handler);
  const guard = new ResourceOwnerGuard(new Reflector(), new OwnershipService(database));
  const request = (listingId) => ({ headers: {}, params: { listingId }, user: { id: ownerId, roles: ['FARMER'] } });
  assert.equal(await guard.canActivate(httpContext(request(ownListing), handler)), true);
  await assert.rejects(guard.canActivate(httpContext(request(foreignListing), handler)), /Resource not found/);
});

test('listing routes require FARMER and ID routes require listing ownership', async () => {
  const { ListingsController } = await import('../dist/listings/listings.controller.js');
  const { ROLES_KEY, OWNER_KEY } = await import('../dist/authorization/authorization.decorators.js');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ListingsController), ['FARMER']);
  for (const method of ['findOne', 'update', 'cancel']) {
    assert.deepEqual(Reflect.getMetadata(OWNER_KEY, ListingsController.prototype[method]), {
      resource: 'LISTING',
      parameter: 'id',
    });
  }
});

test('listing input accepts valid data and rejects client-supplied farmer identity', async () => {
  const { CreateListingDto } = await import('../dist/listings/listings.dto.js');
  const pipe = createValidationPipe();
  const valid = {
    productId: '70000000-0000-4000-8000-000000000001',
    title: 'Potatoes',
    quantity: 10,
    unit: 'KG',
    pricePerUnit: 4500,
    region: 'Toshkent',
    district: 'Qibray',
    latitude: 41.389,
    longitude: 69.465,
  };
  const metadata = { type: 'body', metatype: CreateListingDto };
  assert.ok(await pipe.transform(valid, metadata) instanceof CreateListingDto);
  await assert.rejects(pipe.transform({ ...valid, farmerId: 'attacker-controlled' }, metadata));
  await assert.rejects(pipe.transform({ ...valid, quantity: 0 }, metadata));
  await assert.rejects(pipe.transform({ ...valid, latitude: 91 }, metadata));
});

test('marketplace query validates filters, pagination, and safe defaults', async () => {
  const { MarketplaceListingsQueryDto } = await import('../dist/marketplace/marketplace.dto.js');
  const pipe = createValidationPipe();
  const metadata = { type: 'query', metatype: MarketplaceListingsQueryDto };
  const valid = await pipe.transform({ page: '2', page_size: '25', min_price: '100', sort_order: 'asc' }, metadata);
  assert.equal(valid.page, 2);
  assert.equal(valid.page_size, 25);
  assert.equal(valid.min_price, 100);
  assert.equal(valid.sort_order, 'asc');
  const defaults = await pipe.transform({}, metadata);
  assert.deepEqual({ page: defaults.page, pageSize: defaults.page_size, sort: defaults.sort_order },
    { page: 1, pageSize: 20, sort: 'desc' });
  await assert.rejects(pipe.transform({ product_id: 'not-a-uuid' }, metadata));
  await assert.rejects(pipe.transform({ min_price: '-1' }, metadata));
  await assert.rejects(pipe.transform({ page: '0' }, metadata));
  await assert.rejects(pipe.transform({ page_size: '101' }, metadata));
});

test('marketplace is BUYER-only and queries only sellable indexed listings', async () => {
  const { MarketplaceController } = await import('../dist/marketplace/marketplace.controller.js');
  const { MarketplaceService } = await import('../dist/marketplace/marketplace.service.js');
  const { MarketplaceListingsQueryDto } = await import('../dist/marketplace/marketplace.dto.js');
  const { ROLES_KEY } = await import('../dist/authorization/authorization.decorators.js');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, MarketplaceController), ['BUYER']);
  const calls = [];
  const now = new Date();
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT count')) return { rows: [{ total: '1' }] };
    return { rows: [{
      id: 'listing', title: 'Potatoes', status: 'ACTIVE', description: null, available_quantity: '10.00', unit: 'KG',
      price_per_unit: '4500.00', region: 'Toshkent', district: 'Qibray', latitude: null, longitude: null,
      created_at: now, updated_at: now, product_id: 'product', product_name: 'Potato',
      product_unit_type: 'KG', category_id: 'category', category_name: 'Kartoshka', farm_name: 'Demo Farm',
      farmer_region: 'Toshkent', farmer_district: 'Qibray', farmer_verification_status: 'VERIFIED',
    }] };
  } };
  const service = new MarketplaceService(database);
  const query = new MarketplaceListingsQueryDto();
  const response = await service.findListings(query);
  assert.equal(response.data[0].availableQuantity, 10);
  assert.equal(response.data[0].farmer.phone, undefined);
  assert.equal(response.pagination.totalItems, 1);
  for (const call of calls) {
    assert.match(call.sql, /l\.status = 'ACTIVE'/);
    assert.match(call.sql, /l\.available_quantity > 0/);
  }
  assert.match(calls[1].sql, /ORDER BY l\.created_at DESC, l\.id DESC/);
});

test('order creation accepts only listing and quantity from a BUYER', async () => {
  const { OrdersController } = await import('../dist/orders/orders.controller.js');
  const { CreateOrderDto } = await import('../dist/orders/orders.dto.js');
  const { ROLES_KEY } = await import('../dist/authorization/authorization.decorators.js');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, OrdersController), ['BUYER']);
  const pipe = createValidationPipe();
  const metadata = { type: 'body', metatype: CreateOrderDto };
  const valid = { listing_id: '80000000-0000-4000-8000-000000000001', quantity: 2.5 };
  assert.ok(await pipe.transform(valid, metadata) instanceof CreateOrderDto);
  await assert.rejects(pipe.transform({ ...valid, buyer_id: 'client-controlled' }, metadata));
  await assert.rejects(pipe.transform({ ...valid, unit_price: 1 }, metadata));
  await assert.rejects(pipe.transform({ ...valid, quantity: 0 }, metadata));
  await assert.rejects(pipe.transform({ ...valid, listing_id: 'bad-id' }, metadata));
});

test('order service reserves stock then snapshots server price in one transaction', async () => {
  const { OrdersService } = await import('../dist/orders/orders.service.js');
  const calls = [];
  const now = new Date();
  const client = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('buyer_profiles')) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    if (sql.includes('reserve_listing_stock')) return { rows: [{
      listing_id: 'listing-id', farmer_id: 'farmer-id', unit_price: '4500.00',
      reserved_quantity: '2.00', remaining_quantity: '8.00',
    }] };
    if (sql.includes('FROM users WHERE id')) return { rows: [{ status: 'ACTIVE' }] };
    if (sql.includes("set_config('app.changed_by'")) return { rows: [] };
    if (sql.includes('INSERT INTO orders')) return { rows: [{
      id: 'order-id', farmer_id: 'farmer-id', status: 'PENDING', subtotal: '9000.00',
      delivery_fee: '0.00', total_amount: '9000.00', created_at: now, updated_at: now,
    }] };
    if (sql.includes('INSERT INTO order_items')) return { rows: [{
      id: 'item-id', listing_id: 'listing-id', quantity: '2.00', unit_price: '4500.00', line_total: '9000.00',
    }] };
    throw new Error('unexpected query');
  } };
  const database = { transaction: async (work) => work(client) };
  const response = await new OrdersService(database).create('buyer-id', { listing_id: 'listing-id', quantity: 2 });
  assert.equal(response.status, 'PENDING');
  assert.equal(response.subtotal, 9000);
  assert.equal(response.items[0].unitPrice, 4500);
  assert.match(calls[1].sql, /reserve_listing_stock/);
  assert.deepEqual(calls[1].values, ['listing-id', 2]);
  assert.deepEqual(calls[4].values, ['buyer-id', 'farmer-id', '2.00', '4500.00']);
});

test('order lifecycle exposes the centralized allowed transition map', async () => {
  const { ORDER_TRANSITIONS } = await import('../dist/orders/order-lifecycle.js');
  assert.deepEqual(Object.fromEntries(Object.entries(ORDER_TRANSITIONS).map(([action, rule]) =>
    [action, { from: rule.from, to: rule.to }])), {
    CONFIRM: { from: ['PENDING'], to: 'CONFIRMED' },
    REQUEST_TRANSPORT: { from: ['CONFIRMED'], to: 'TRANSPORT_PENDING' },
    ASSIGN_TRANSPORT: { from: ['TRANSPORT_PENDING'], to: 'TRANSPORT_ASSIGNED' },
    START_TRANSIT: { from: ['TRANSPORT_ASSIGNED'], to: 'IN_TRANSIT' },
    MARK_DELIVERED: { from: ['IN_TRANSIT'], to: 'DELIVERED' },
    COMPLETE: { from: ['DELIVERED'], to: 'COMPLETED' },
    CANCEL: { from: ['PENDING', 'CONFIRMED'], to: 'CANCELLED' },
    DISPUTE: { from: ['DELIVERED', 'COMPLETED'], to: 'DISPUTED' },
  });
});

test('order lifecycle rejects PENDING to DELIVERED and foreign actors', async () => {
  const { OrderLifecycleService } = await import('../dist/orders/order-lifecycle.service.js');
  const order = { id: 'order', buyer_id: 'buyer', farmer_id: 'farmer', status: 'PENDING' };
  const database = { transaction: async (work) => work({ query: async () => ({ rows: [order], rowCount: 1 }) }) };
  const service = new OrderLifecycleService(database);
  await assert.rejects(service.transition('order', 'MARK_DELIVERED', {
    id: 'admin', roles: ['ADMIN'], phone: '', email: null, fullName: '',
  }), /Cannot MARK_DELIVERED/);
  await assert.rejects(service.transition('order', 'CONFIRM', {
    id: 'different-farmer', roles: ['FARMER'], phone: '', email: null, fullName: '',
  }), /Order not found/);
});

test('successful order transition sets actor context and reads trigger history', async () => {
  const { OrderLifecycleService } = await import('../dist/orders/order-lifecycle.service.js');
  const calls = [];
  const now = new Date();
  const client = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT id,')) return { rows: [{
      id: 'order', buyer_id: 'buyer', farmer_id: 'farmer', status: 'PENDING',
    }], rowCount: 1 };
    if (sql.includes("set_config('app.")) return { rows: [], rowCount: 1 };
    if (sql.startsWith('UPDATE orders')) return { rows: [{ updated_at: now }], rowCount: 1 };
    if (sql.includes('FROM order_status_history')) return { rows: [{
      previous_status: 'PENDING', new_status: 'CONFIRMED', changed_by: 'farmer',
      note: 'Stock confirmed', created_at: now,
    }], rowCount: 1 };
    throw new Error('unexpected query');
  } };
  const database = { transaction: async (work) => work(client) };
  const response = await new OrderLifecycleService(database).transition('order', 'CONFIRM', {
    id: 'farmer', roles: ['FARMER'], phone: '', email: null, fullName: '',
  }, 'Stock confirmed');
  assert.deepEqual({ previous: response.previousStatus, status: response.status, actor: response.changedBy },
    { previous: 'PENDING', status: 'CONFIRMED', actor: 'farmer' });
  assert.deepEqual(calls[1].values, ['farmer']);
  assert.deepEqual(calls[2].values, ['Stock confirmed']);
  assert.deepEqual(calls[3].values, ['order', 'CONFIRMED', 'PENDING']);
});

test('transition body rejects client-supplied status', async () => {
  const { TransitionOrderDto } = await import('../dist/orders/order-lifecycle.dto.js');
  const pipe = createValidationPipe();
  const metadata = { type: 'body', metatype: TransitionOrderDto };
  assert.ok(await pipe.transform({ note: 'Valid note' }, metadata) instanceof TransitionOrderDto);
  await assert.rejects(pipe.transform({ status: 'DELIVERED' }, metadata));
});

test('transport endpoints are TRANSPORTER-only and reject client transporter identity', async () => {
  const { TransportController } = await import('../dist/logistics/transport.controller.js');
  const { CreateTransportOfferDto, AvailableTransportQueryDto } =
    await import('../dist/logistics/transport.dto.js');
  const { ROLES_KEY } = await import('../dist/authorization/authorization.decorators.js');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, TransportController), ['TRANSPORTER']);
  const pipe = createValidationPipe();
  const offerMetadata = { type: 'body', metatype: CreateTransportOfferDto };
  const valid = {
    shipment_id: '11111111-1111-4111-8111-111111111111',
    vehicle_id: '22222222-2222-4222-8222-222222222222',
  };
  assert.ok(await pipe.transform(valid, offerMetadata) instanceof CreateTransportOfferDto);
  await assert.rejects(pipe.transform({ ...valid, transporter_id: 'client-controlled' }, offerMetadata));
  await assert.rejects(pipe.transform({ ...valid, offered_price: 1 }, offerMetadata));
  const queryMetadata = { type: 'query', metatype: AvailableTransportQueryDto };
  const defaults = await pipe.transform({}, queryMetadata);
  assert.deepEqual({ page: defaults.page, pageSize: defaults.page_size }, { page: 1, pageSize: 20 });
  await assert.rejects(pipe.transform({ page_size: '101' }, queryMetadata));
});

test('transport offer checks vehicle ownership and capacity before insert', async () => {
  const { TransportService } = await import('../dist/logistics/transport.service.js');
  const baseInput = { shipment_id: 'shipment', vehicle_id: 'vehicle' };
  const pricing = { quote: async () => ({ weightKg: 1200, total: 50000 }) };
  const makeDatabase = (vehicleRows, required = '1200.00') => ({ query: async () => ({ rowCount: 1 }), transaction: async (work) => work({
    query: async (sql) => {
      if (sql.includes('transporter_profiles')) return { rows: [{ availability_status: 'AVAILABLE' }], rowCount: 1 };
      if (sql.includes('FROM shipments')) return { rows: [{
        id: 'shipment', order_id: 'order', status: 'PENDING', transporter_id: null,
      }], rowCount: 1 };
      if (sql.includes('FROM orders')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
      if (sql.includes('FROM vehicles')) return { rows: vehicleRows, rowCount: vehicleRows.length };
      if (sql.includes('FROM order_items')) return { rows: [{ required_capacity_kg: required }], rowCount: 1 };
      throw new Error('offer insert should not be reached');
    },
  }) });
  await assert.rejects(new TransportService(makeDatabase([]), pricing).createOffer('transporter', baseInput),
    /Vehicle not found/);
  await assert.rejects(new TransportService(makeDatabase([
    { id: 'vehicle', capacity_kg: '1000.00', status: 'ACTIVE' },
  ]), pricing).createOffer('transporter', baseInput), /capacity is insufficient/);
});

test('duplicate active transport offer becomes a conflict', async () => {
  const { TransportService } = await import('../dist/logistics/transport.service.js');
  const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
  const database = { query: async () => ({ rowCount: 1 }), transaction: async () => { throw duplicate; } };
  await assert.rejects(new TransportService(database, { quote: async () => ({ weightKg: 10, total: 50000 }) }).createOffer('transporter', {
    shipment_id: 'shipment', vehicle_id: 'vehicle',
  }), /active offer already exists/);
});

test('shipment lifecycle routes enforce farmer/admin acceptance and transporter actions', async () => {
  const { ShipmentLifecycleController } =
    await import('../dist/logistics/shipment-lifecycle.controller.js');
  const { ROLES_KEY } = await import('../dist/authorization/authorization.decorators.js');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ShipmentLifecycleController.prototype.acceptOffer),
    ['FARMER', 'ADMIN']);
  for (const method of ['pickedUp', 'inTransit', 'delivered']) {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ShipmentLifecycleController.prototype[method]),
      ['TRANSPORTER']);
  }
});

test('shipment lifecycle rejects foreign actors and out-of-order actions', async () => {
  const { ShipmentLifecycleService } = await import('../dist/logistics/shipment-lifecycle.service.js');
  const shipment = {
    id: 'shipment', order_id: 'order', transporter_id: 'assigned', vehicle_id: 'vehicle',
    status: 'ASSIGNED', order_status: 'TRANSPORT_ASSIGNED',
  };
  const database = { transaction: async (work) => work({ query: async () => ({ rows: [shipment], rowCount: 1 }) }) };
  const service = new ShipmentLifecycleService(database);
  await assert.rejects(service.transition('shipment', 'PICKED_UP', {
    id: 'foreign', roles: ['TRANSPORTER'], phone: '', email: null, fullName: '',
  }), /Shipment not found/);
  await assert.rejects(service.transition('shipment', 'IN_TRANSIT', {
    id: 'assigned', roles: ['TRANSPORTER'], phone: '', email: null, fullName: '',
  }), /Cannot mark shipment IN_TRANSIT from ASSIGNED/);
});

test('offer acceptance rejects a farmer who does not own the order', async () => {
  const { ShipmentLifecycleService } = await import('../dist/logistics/shipment-lifecycle.service.js');
  let call = 0;
  const client = { query: async () => {
    call += 1;
    if (call === 1) return { rows: [{ shipment_id: 'shipment' }], rowCount: 1 };
    return { rows: [{
      id: 'shipment', order_id: 'order', transporter_id: null, vehicle_id: null,
      status: 'PENDING', order_status: 'TRANSPORT_PENDING', farmer_id: 'owner',
    }], rowCount: 1 };
  } };
  const database = { transaction: async (work) => work(client) };
  await assert.rejects(new ShipmentLifecycleService(database).acceptOffer('offer', {
    id: 'foreign-farmer', roles: ['FARMER'], phone: '', email: null, fullName: '',
  }), /Transport offer not found/);
  assert.equal(call, 2);
});

test('admin monitoring routes are ADMIN-only and query validation is bounded', async () => {
  const { AdminController } = await import('../dist/admin/admin.controller.js');
  const { AdminUsersQueryDto, AdminListingsQueryDto } =
    await import('../dist/admin/admin.dto.js');
  const { ROLES_KEY } = await import('../dist/authorization/authorization.decorators.js');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AdminController), ['ADMIN']);

  const pipe = createValidationPipe();
  const defaults = await pipe.transform({}, { type: 'query', metatype: AdminUsersQueryDto });
  assert.deepEqual({ page: defaults.page, pageSize: defaults.page_size }, { page: 1, pageSize: 20 });
  await assert.rejects(pipe.transform({ page_size: '101' },
    { type: 'query', metatype: AdminUsersQueryDto }));
  await assert.rejects(pipe.transform({ status: 'UNKNOWN' },
    { type: 'query', metatype: AdminUsersQueryDto }));
  await assert.rejects(pipe.transform({ farmer_id: 'not-a-uuid' },
    { type: 'query', metatype: AdminListingsQueryDto }));
});

test('admin user response is paginated, filtered, and never selects auth secrets', async () => {
  const { AdminService } = await import('../dist/admin/admin.service.js');
  const calls = [];
  const now = new Date();
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT count(*)')) return { rows: [{ total: '1' }] };
    return { rows: [{
      id: 'user-id', phone: '+998900000000', email: null, full_name: 'Demo Admin',
      status: 'ACTIVE', roles: ['ADMIN'], created_at: now, updated_at: now,
    }] };
  } };
  const response = await new AdminService(database).users({
    page: 2, page_size: 5, status: 'ACTIVE', role: 'ADMIN',
  });
  assert.equal(response.data[0].fullName, 'Demo Admin');
  assert.equal(response.data[0].passwordHash, undefined);
  assert.equal(response.data[0].refreshTokenHash, undefined);
  assert.equal(response.pagination.totalPages, 1);
  assert.match(calls[0].sql, /u\.status = \$1/);
  assert.match(calls[0].sql, /fr\.name = \$2/);
  assert.match(calls[1].sql, /ORDER BY u\.created_at DESC, u\.id DESC/);
  assert.deepEqual(calls[1].values, ['ACTIVE', 'ADMIN', 5, 5]);
  for (const call of calls) {
    assert.doesNotMatch(call.sql, /auth_credentials|auth_sessions|identity_verifications/);
  }
});

test('listing moderation routes are ADMIN-only and reject invalid input', async () => {
  const { AdminController } = await import('../dist/admin/admin.controller.js');
  const { RejectListingDto } = await import('../dist/admin/admin.dto.js');
  const { ROLES_KEY } = await import('../dist/authorization/authorization.decorators.js');
  const { ParseUUIDPipe } = await import('@nestjs/common');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AdminController), ['ADMIN']);

  const validation = createValidationPipe();
  const metadata = { type: 'body', metatype: RejectListingDto };
  assert.ok(await validation.transform({ reason: 'Incorrect listing details' }, metadata)
    instanceof RejectListingDto);
  await assert.rejects(validation.transform({ reason: '   ' }, metadata));
  await assert.rejects(validation.transform({ status: 'ACTIVE' }, metadata));
  await assert.rejects(new ParseUUIDPipe().transform('not-a-uuid', { type: 'param' }));
});

test('admin approve and reject are transactional and append audit logs', async () => {
  const { AdminService } = await import('../dist/admin/admin.service.js');
  for (const scenario of [
    { call: 'approveListing', target: 'ACTIVE', action: 'LISTING_APPROVED', reason: undefined },
    { call: 'rejectListing', target: 'REJECTED', action: 'LISTING_REJECTED', reason: 'Bad photo' },
  ]) {
    const calls = [];
    const now = new Date();
    const client = { query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('FROM listings')) return {
        rows: [{ id: 'listing-id', title: 'Potatoes', status: 'PENDING' }], rowCount: 1,
      };
      if (sql.startsWith('UPDATE listings')) return {
        rows: [{ id: 'listing-id', title: 'Potatoes', status: scenario.target, updated_at: now }], rowCount: 1,
      };
      if (sql.includes('INSERT INTO audit_logs')) return {
        rows: [{ id: 'audit-id', action: scenario.action, created_at: now }], rowCount: 1,
      };
      throw new Error('unexpected query');
    } };
    let transactionCount = 0;
    const database = { transaction: async (work) => {
      transactionCount += 1;
      return work(client);
    } };
    const service = new AdminService(database);
    const response = await service[scenario.call]('listing-id', 'admin-id', scenario.reason);
    assert.equal(transactionCount, 1);
    assert.equal(response.listing.status, scenario.target);
    assert.equal(response.moderation.action, scenario.action);
    assert.match(calls[0].sql, /FOR UPDATE/);
    assert.deepEqual(calls[1].values, ['listing-id', scenario.target]);
    assert.equal(calls[2].values[0], 'admin-id');
    assert.equal(calls[2].values[1], scenario.action);
    const metadataValue = JSON.parse(calls[2].values[3]);
    assert.deepEqual(metadataValue, {
      previous_status: 'PENDING', new_status: scenario.target,
      ...(scenario.reason ? { reason: scenario.reason } : {}),
    });
  }
});

test('admin moderation rejects non-pending listings without update or audit', async () => {
  const { AdminService } = await import('../dist/admin/admin.service.js');
  let calls = 0;
  const client = { query: async () => {
    calls += 1;
    return { rows: [{ id: 'listing-id', title: 'Potatoes', status: 'ACTIVE' }], rowCount: 1 };
  } };
  const database = { transaction: async (work) => work(client) };
  await assert.rejects(new AdminService(database).rejectListing(
    'listing-id', 'admin-id', 'Try again'), /ACTIVE status cannot be moderated/);
  assert.equal(calls, 1);
});

test('farmer catalog and order visibility endpoints require FARMER', async () => {
  const { ListingsController } = await import('../dist/listings/listings.controller.js');
  const { OrdersController } = await import('../dist/orders/orders.controller.js');
  const { ROLES_KEY } = await import('../dist/authorization/authorization.decorators.js');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ListingsController), ['FARMER']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, OrdersController.prototype.findForFarmer), ['FARMER']);
});

test('farmer catalog groups active database products by category', async () => {
  const { ListingsService } = await import('../dist/listings/listings.service.js');
  const database = { query: async (sql) => {
    assert.match(sql, /c\.active = TRUE/);
    assert.match(sql, /p\.active = TRUE/);
    return { rows: [
      { category_id: 'category', category_name: 'Vegetables', product_id: 'one', product_name: 'Carrot', unit_type: 'KG' },
      { category_id: 'category', category_name: 'Vegetables', product_id: 'two', product_name: 'Tomato', unit_type: 'KG' },
    ] };
  } };
  const result = await new ListingsService(database).catalog();
  assert.equal(result.categories.length, 1);
  assert.deepEqual(result.categories[0].products.map((product) => product.name), ['Carrot', 'Tomato']);
});

test('farmer order visibility scopes by authenticated farmer and returns clean DTOs', async () => {
  const { OrdersService } = await import('../dist/orders/orders.service.js');
  const now = new Date();
  const calls = [];
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{
      id: 'order', status: 'PENDING', subtotal: '100.00', delivery_fee: '0.00',
      total_amount: '100.00', buyer_id: 'buyer', buyer_name: 'Demo Buyer',
      items: [{ id: 'item', listingId: 'listing', productName: 'Carrot',
        listingTitle: 'Fresh carrots', quantity: 2, unitPrice: 50, lineTotal: 100 }],
      created_at: now, updated_at: now,
    }] };
  } };
  const result = await new OrdersService(database).findForFarmer('farmer');
  assert.deepEqual(calls[0].values, ['farmer']);
  assert.match(calls[0].sql, /WHERE o\.farmer_id = \$1/);
  assert.equal(result[0].buyer.fullName, 'Demo Buyer');
  assert.equal(result[0].buyer.phone, undefined);
  assert.equal(result[0].totalAmount, 100);
});

test('buyer marketplace detail exposes only active available listings', async () => {
  const { MarketplaceService } = await import('../dist/marketplace/marketplace.service.js');
  const now = new Date();
  const calls = [];
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [{
      id: 'listing', title: 'Potatoes', status: 'ACTIVE', description: null,
      available_quantity: '10.00', unit: 'KG', price_per_unit: '4500.00',
      region: 'Toshkent', district: 'Qibray', latitude: null, longitude: null,
      created_at: now, updated_at: now, product_id: 'product', product_name: 'Potato',
      product_unit_type: 'KG', category_id: 'category', category_name: 'Vegetables',
      farm_name: 'Demo Farm', farmer_region: 'Toshkent', farmer_district: 'Qibray',
      farmer_verification_status: 'VERIFIED',
    }] };
  } };
  const result = await new MarketplaceService(database).findListing('listing');
  assert.equal(result.status, 'ACTIVE');
  assert.deepEqual(calls[0].values, ['listing']);
  assert.match(calls[0].sql, /l\.status = 'ACTIVE'/);
  assert.match(calls[0].sql, /l\.available_quantity > 0/);
});

test('buyer order reads are ownership-scoped and derive available actions server-side', async () => {
  const { OrdersService } = await import('../dist/orders/orders.service.js');
  const now = new Date();
  const calls = [];
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM orders o JOIN users')) return { rows: [{
      id: 'order', status: 'CONFIRMED', subtotal: '100.00', delivery_fee: '10.00',
      total_amount: '110.00', farmer_id: 'farmer', farmer_name: 'Demo Farmer',
      created_at: now, updated_at: now,
    }] };
    if (sql.includes('FROM order_items oi') && !sql.includes('FROM shipments s')) return { rows: [{
      id: 'item', listing_id: 'listing', listing_title: 'Potatoes', product_name: 'Potato',
      quantity: '2.00', unit_price: '50.00', line_total: '100.00',
    }] };
    if (sql.includes('FROM shipments s')) return { rows: [] };
    if (sql.includes('FROM payments')) return { rows: [] };
    if (sql.includes('FROM escrow_accounts')) return { rows: [] };
    throw new Error('unexpected query');
  } };
  const result = await new OrdersService(database).findBuyerOrder('order', 'buyer');
  assert.deepEqual(calls[0].values, ['order', 'buyer']);
  assert.match(calls[0].sql, /o\.id = \$1 AND o\.buyer_id = \$2/);
  assert.equal(result.totalAmount, 110);
  assert.equal(result.availableActions.demoPay, false); // CONFIRMED: delivery price is not agreed yet.
  assert.equal(result.availableActions.acceptDelivery, false);
  assert.equal(result.farmer.phone, undefined);
});

test('transporter read routes remain protected by the TRANSPORTER role', async () => {
  const { TransportController } = await import('../dist/logistics/transport.controller.js');
  const { ROLES_KEY } = await import('../dist/authorization/authorization.decorators.js');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, TransportController), ['TRANSPORTER']);
  for (const method of ['available', 'vehicles', 'deliveries', 'shipment', 'createOffer']) {
    assert.equal(typeof TransportController.prototype[method], 'function');
  }
});

test('transporter shipment reads are ownership-scoped and derive the next action server-side', async () => {
  const { TransportService } = await import('../dist/logistics/transport.service.js');
  const now = new Date();
  const calls = [];
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM shipments s')) return { rows: [{
      id: 'shipment', order_id: 'order', shipment_status: 'ASSIGNED', order_status: 'TRANSPORT_ASSIGNED',
      total_amount: '120000.00', item_count: '1', cargo_summary: 'Potato x 20 KG',
      required_capacity_kg: '20.00', pickup_region: 'Toshkent', pickup_district: 'Qibray',
      pickup_latitude: null, pickup_longitude: null, destination_region: 'Toshkent',
      destination_district: 'Yunusobod', destination_latitude: null, destination_longitude: null,
      pickup_time: null, delivered_time: null, created_at: now, updated_at: now,
      vehicle_id: 'vehicle', vehicle_type: 'TRUCK', plate_number: '01A001AA',
      vehicle_capacity_kg: '2000.00', refrigerated: false, accepted_price: '50000.00',
    }] };
    if (sql.includes('FROM transport_offers')) return { rows: [] };
    if (sql.includes('FROM shipment_events')) return { rows: [] };
    throw new Error('unexpected query');
  } };
  const result = await new TransportService(database).shipment('transporter', 'shipment');
  assert.deepEqual(calls[0].values, ['shipment', 'transporter']);
  assert.match(calls[0].sql, /s\.transporter_id = \$2/);
  assert.equal(result.availableAction, 'PICKED_UP');
  assert.equal(result.acceptedPrice, 50000);
  assert.equal(result.order.totalAmount, 120000);
});

test('buyer shipment tracking returns coordinates with listing and profile location fallbacks', async () => {
  const { OrdersService } = await import('../dist/orders/orders.service.js');
  const now = new Date();
  const calls = [];
  const database = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM orders o JOIN users')) return { rows: [{
      id: 'order', status: 'IN_TRANSIT', subtotal: '100.00', delivery_fee: '10.00',
      total_amount: '110.00', farmer_id: 'farmer', farmer_name: 'Farmer',
      created_at: now, updated_at: now,
    }] };
    if (sql.includes('FROM order_items oi JOIN listings') && !sql.includes('FROM shipments s')) return { rows: [] };
    if (sql.includes('FROM shipments s')) return { rows: [{
      id: 'shipment', status: 'IN_TRANSIT', pickup_time: now, delivered_time: null,
      transporter_name: 'Transporter', vehicle_type: 'TRUCK', plate_number: '01A001AA',
      pickup_region: 'Toshkent', pickup_district: 'Qibray', pickup_latitude: '41.3890',
      pickup_longitude: '69.4650', destination_region: 'Toshkent', destination_district: 'Yunusobod',
      destination_latitude: null, destination_longitude: null,
    }] };
    if (sql.includes('FROM payments')) return { rows: [] };
    if (sql.includes('FROM escrow_accounts')) return { rows: [] };
    if (sql.includes('FROM shipment_events')) return { rows: [] };
    throw new Error('unexpected query');
  } };
  const result = await new OrdersService(database).findBuyerOrder('order', 'buyer');
  const shipmentQuery = calls.find((call) => call.sql.includes('FROM shipments s'));
  assert.match(shipmentQuery.sql, /JOIN LATERAL/);
  assert.match(shipmentQuery.sql, /COALESCE\(s\.pickup_latitude, pickup\.latitude\)/);
  assert.deepEqual(result.shipment.pickup, {
    region: 'Toshkent', district: 'Qibray', latitude: 41.389, longitude: 69.465,
  });
  assert.deepEqual(result.shipment.destination, {
    region: 'Toshkent', district: 'Yunusobod', latitude: null, longitude: null,
  });
});
