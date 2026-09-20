// Run from backend: node --env-file=.env test/demo-payment.integration.mjs
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { DatabaseService } from '../dist/database/database.service.js';
import { DemoPaymentService } from '../dist/payments/demo-payment.service.js';
import { DemoPaymentController } from '../dist/payments/demo-payment.controller.js';
import { DeliveryAcceptanceController } from '../dist/payments/delivery-acceptance.controller.js';
import { DeliveryAcceptanceService } from '../dist/payments/delivery-acceptance.service.js';
import { OrderLifecycleController } from '../dist/orders/order-lifecycle.controller.js';
import { OrderLifecycleService } from '../dist/orders/order-lifecycle.service.js';
import { TokenService } from '../dist/auth/token.service.js';
import { JwtAuthenticationGuard } from '../dist/authorization/jwt-authentication.guard.js';
import { RolesGuard } from '../dist/authorization/roles.guard.js';
import { createValidationPipe } from '../dist/common/validation.js';

const schema = 'test_demo_payment_' + randomUUID().replaceAll('-', '');
const connection = {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
};
assert.equal(connection.database, 'agro_marketplace');
const admin = new Pool(connection);
let pool, app;
try {
  await admin.query('CREATE SCHEMA ' + schema);
  pool = new Pool({ ...connection, max: 12, options: '-c search_path=' + schema + ',public' });
  for (const file of ['002_identity.sql', '003_marketplace.sql', '004_orders.sql', '005_logistics.sql', '006_payments.sql', '012_demo_wallet.sql']) {
    await pool.query(await readFile(new URL('../../database/' + file, import.meta.url), 'utf8'));
  }
  const db = new DatabaseService(pool);
  const buyer = randomUUID(), farmer = randomUUID(), foreign = randomUUID(), transporter = randomUUID();
  for (const [id, role] of [[buyer, 'BUYER'], [farmer, 'FARMER'], [foreign, 'BUYER'], [transporter, 'TRANSPORTER']]) {
    await pool.query("INSERT INTO users(id,phone,full_name,status) VALUES($1,$2,'Demo test','ACTIVE')", [id, id]);
    await pool.query('INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE name=$2', [id, role]);
  }
  await pool.query("INSERT INTO buyer_profiles(user_id,buyer_type,region,district) VALUES($1,'INDIVIDUAL','Toshkent','Qibray')", [buyer]);
  await pool.query("INSERT INTO farmer_profiles(user_id,region,district) VALUES($1,'Toshkent','Qibray')", [farmer]);
  await pool.query("INSERT INTO transporter_profiles(user_id,availability_status) VALUES($1,'AVAILABLE')", [transporter]);
  const vehicle = (await pool.query(
    "INSERT INTO vehicles(transporter_id,vehicle_type,plate_number,capacity_kg) VALUES($1,'TRUCK',$2,1000) RETURNING id",
    [transporter, schema],
  )).rows[0];
  await pool.query('INSERT INTO demo_wallets(user_id,balance) VALUES($1,10000)', [buyer]);
  const newOrder = async (status = 'CONFIRMED', total = '110.00', delivery = '0.00') => (await pool.query(
    'INSERT INTO orders(buyer_id,farmer_id,status,subtotal,delivery_fee,total_amount) VALUES($1,$2,$3,$4::numeric-$5::numeric,$5,$4) RETURNING id',
    [buyer, farmer, status, total, delivery],
  )).rows[0].id;
  const config = new ConfigService({ JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_ACCESS_TTL_SECONDS: 900 });
  class TestApp {}
  Module({
    controllers: [DemoPaymentController, DeliveryAcceptanceController, OrderLifecycleController],
    providers: [
      DemoPaymentService, DeliveryAcceptanceService, OrderLifecycleService, TokenService,
      { provide: DatabaseService, useValue: db },
      { provide: ConfigService, useValue: config },
      { provide: APP_GUARD, useClass: JwtAuthenticationGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  })(TestApp);
  app = await NestFactory.create(TestApp, { logger: false });
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const tokens = app.get(TokenService);
  const pay = async (id, actor = buyer, body = {}) => {
    const response = await fetch(base + '/orders/' + id + '/demo-pay', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + tokens.signAccess(actor) } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const orderId = await newOrder();
  assert.equal((await pay(orderId, null)).status, 401);
  assert.equal((await pay(orderId, farmer)).status, 403);
  assert.equal((await pay(orderId, foreign)).status, 404);
  assert.equal((await pay('bad-id')).status, 400);
  for (const field of ['amount', 'buyer_id', 'fees', 'status']) {
    assert.equal((await pay(orderId, buyer, { [field]: 1 })).status, 400);
  }
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => pay(orderId)));
  for (const result of concurrent) {
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, concurrent[0].body);
  }
  assert.deepEqual((await pay(orderId)).body, concurrent[0].body);
  const counts = async id => (await pool.query(
    'SELECT (SELECT count(*) FROM payments WHERE order_id=$1)::int AS payments, (SELECT count(*) FROM escrow_accounts WHERE order_id=$1)::int AS escrow, (SELECT count(*) FROM financial_ledger WHERE order_id=$1)::int AS ledger', [id],
  )).rows[0];
  assert.deepEqual(await counts(orderId), { payments: 1, escrow: 1, ledger: 2 });
  for (const status of ['PENDING', 'CANCELLED', 'DISPUTED', 'COMPLETED']) {
    const invalid = await newOrder(status);
    assert.equal((await pay(invalid)).status, 409);
    assert.deepEqual(await counts(invalid), { payments: 0, escrow: 0, ledger: 0 });
  }
  assert.equal((await pay(await newOrder('CONFIRMED', '0'))).status, 409);
  const retryOrder = await newOrder();
  await pool.query("INSERT INTO payments(order_id,provider,amount,status) VALUES($1,'DEMO',110,'FAILED')", [retryOrder]);
  await pool.query("INSERT INTO escrow_accounts(order_id,gross_amount,platform_fee,farmer_amount,transporter_amount) VALUES($1,110.33,0.33,110,0)", [retryOrder]);
  assert.equal((await pay(retryOrder)).status, 200);
  assert.deepEqual(await counts(retryOrder), { payments: 1, escrow: 1, ledger: 2 });

  // Throw after the second real ledger INSERT: every prior write must roll back.
  const rollbackOrder = await newOrder();
  const balanceBeforeRollback = (await pool.query('SELECT balance FROM demo_wallets WHERE user_id=$1', [buyer])).rows[0].balance;
  const faultDb = { transaction: work => db.transaction(client => {
    let ledgerWrites = 0;
    return work({ query: async (sql, args) => {
      const result = await client.query(sql, args);
      if (sql.startsWith('INSERT INTO financial_ledger') && ++ledgerWrites === 2) throw new Error('Injected failure after ledger writes');
      return result;
    } });
  }) };
  await assert.rejects(new DemoPaymentService(faultDb).pay(rollbackOrder, buyer), /Injected failure/);
  assert.deepEqual(await counts(rollbackOrder), { payments: 0, escrow: 0, ledger: 0 });
  assert.equal((await pool.query('SELECT balance FROM demo_wallets WHERE user_id=$1', [buyer])).rows[0].balance, balanceBeforeRollback);
  assert.equal((await pay(rollbackOrder)).status, 200);
  const accept = async (id, actor = buyer, body = {}, suffix = 'accept-delivery') => {
    const response = await fetch(base + '/orders/' + id + '/' + suffix, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + tokens.signAccess(actor) } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const delivered = await newOrder('DELIVERED', '110.00', '10.00');
  await pool.query("INSERT INTO shipments(order_id,transporter_id,vehicle_id,status,pickup_time,delivered_time) VALUES($1,$2,$3,'DELIVERED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [delivered, transporter, vehicle.id]);
  assert.equal((await pay(delivered)).status, 200);
  // Exercise all three positive stored allocations, including the 0.3% fee.
  assert.equal((await accept(delivered, null)).status, 401);
  assert.equal((await accept(delivered, farmer)).status, 403);
  assert.equal((await accept(delivered, foreign)).status, 404);
  assert.equal((await accept('bad-id')).status, 400);
  for (const field of ['amount', 'buyer_id', 'status', 'platform_fee', 'farmer_amount', 'transporter_amount']) {
    assert.equal((await accept(delivered, buyer, { [field]: 1 })).status, 400);
  }
  assert.equal((await accept(delivered, buyer, {}, 'actions/COMPLETE')).status, 409);
  const releases = await Promise.all(Array.from({ length: 8 }, () => accept(delivered)));
  for (const result of releases) {
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, releases[0].body);
  }
  assert.deepEqual((await accept(delivered)).body, releases[0].body);
  assert.deepEqual(await counts(delivered), { payments: 1, escrow: 1, ledger: 5 });
  const releaseState = async id => (await pool.query(
    "SELECT o.status, e.status AS escrow_status, e.released_at, (SELECT count(*)::int FROM order_status_history WHERE order_id=o.id AND new_status='COMPLETED') AS completions FROM orders o LEFT JOIN escrow_accounts e ON e.order_id=o.id WHERE o.id=$1",
    [id],
  )).rows[0];
  assert.equal((await releaseState(delivered)).completions, 1);
  const allocationTotal = (await pool.query(
    "SELECT sum(amount)::text AS total FROM financial_ledger WHERE order_id=$1 AND entry_type IN ('PLATFORM_FEE','FARMER_PAYOUT','TRANSPORTER_PAYOUT')", [delivered],
  )).rows[0].total;
  assert.equal(allocationTotal, '110.33');
  for (const status of ['PENDING', 'CONFIRMED', 'IN_TRANSIT', 'CANCELLED', 'DISPUTED', 'COMPLETED']) {
    assert.equal((await accept(await newOrder(status))).status, 409);
  }
  assert.equal((await accept(await newOrder('DELIVERED'))).status, 409); // no funding
  const releaseFailure = await newOrder('DELIVERED');
  assert.equal((await pay(releaseFailure)).status, 200);
  const farmerBeforeRollback = (await pool.query('SELECT balance FROM demo_wallets WHERE user_id=$1', [farmer])).rows[0].balance;
  const platformBeforeRollback = (await pool.query('SELECT balance FROM demo_platform_wallet WHERE id=1')).rows[0].balance;
  // Failure after order/history update, escrow release, and a real payout INSERT.
  const releaseFaultDb = { transaction: work => db.transaction(client => work({
    query: async (sql, args) => {
      const result = await client.query(sql, args);
      if (sql.startsWith('INSERT INTO financial_ledger')) throw new Error('Injected release failure');
      return result;
    },
  })) };
  await assert.rejects(new DeliveryAcceptanceService(releaseFaultDb).accept(releaseFailure, buyer), /Injected release failure/);
  assert.deepEqual(await counts(releaseFailure), { payments: 1, escrow: 1, ledger: 2 });
  assert.deepEqual(await releaseState(releaseFailure), {
    status: 'DELIVERED', escrow_status: 'LOCKED', released_at: null, completions: 0,
  });
  assert.equal((await pool.query('SELECT balance FROM demo_wallets WHERE user_id=$1', [farmer])).rows[0].balance, farmerBeforeRollback);
  assert.equal((await pool.query('SELECT balance FROM demo_platform_wallet WHERE id=1')).rows[0].balance, platformBeforeRollback);
  // FUNDED is also supported; a zero transport allocation has no ledger entry.
  await pool.query("UPDATE escrow_accounts SET status='FUNDED' WHERE order_id=$1", [releaseFailure]);
  assert.equal((await accept(releaseFailure)).status, 200);
  assert.deepEqual(await counts(releaseFailure), { payments: 1, escrow: 1, ledger: 4 });
  // Existing partial payouts are refused, never silently duplicated or completed.
  const partial = await newOrder('DELIVERED');
  await pay(partial);
  await pool.query(
    "INSERT INTO financial_ledger(order_id,payment_id,escrow_id,entry_type,amount,event_key) SELECT e.order_id,p.id,e.id,'FARMER_PAYOUT',e.farmer_amount,'unexpected-event' FROM escrow_accounts e JOIN payments p ON p.order_id=e.order_id WHERE e.order_id=$1",
    [partial],
  );
  assert.equal((await accept(partial)).status, 409);
  assert.equal((await releaseState(partial)).status, 'DELIVERED');
  await assert.rejects(pool.query('UPDATE financial_ledger SET amount=amount'), /append-only/);
  console.log(JSON.stringify({
    passed: ['HTTP authentication/role/ownership/input', '8 concurrent payments + retry: 1 payment/1 escrow/2 ledger entries',
      'invalid states and zero amount', 'existing FAILED payment and CREATED escrow', 'rollback after second ledger insertion', 'append-only ledger'],
    releasePassed: ['8 concurrent accepts + retry: one release/three payouts/one completion history',
      'authentication, ownership, body/UUID validation', 'legacy COMPLETE bypass blocked',
      'unpaid/invalid states rejected', 'rollback restores DELIVERED + LOCKED + null release time and no completion history',
      'FUNDED supported; zero allocations skipped', 'partial payouts rejected'],
    successfulResponse: concurrent[0].body,
    successfulReleaseResponse: releases[0].body,
  }, null, 2));
} finally {
  if (app) await app.close();
  else if (pool) await pool.end();
  // Only this randomly named test schema; no production records or triggers are changed.
  await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
  await admin.end();
}
