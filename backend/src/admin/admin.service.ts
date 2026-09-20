import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import {
  AdminDisputesQueryDto,
  AdminListingsQueryDto,
  AdminOrdersQueryDto,
  AdminPaginationDto,
  AdminShipmentsQueryDto,
  AdminUsersQueryDto,
} from './admin.dto.js';

type Row = QueryResultRow & Record<string, unknown>;

type QueryParts = { where: string[]; values: unknown[] };

function add(parts: QueryParts, expression: string, value: unknown): void {
  parts.values.push(value);
  parts.where.push(`${expression} $${parts.values.length}`);
}

function where(parts: QueryParts): string {
  return parts.where.length === 0 ? '' : `WHERE ${parts.where.join(' AND ')}`;
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

function optionalNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

@Injectable()
export class AdminService {
  constructor(private readonly database: DatabaseService) {}

  async turnover() {
    // The append-only buyer payment entry is recorded once per successful payment.
    // Wallet top-ups and escrow funding are not additional sales.
    const result = await this.database.query<{ amount: string; paid_orders: string }>(
      `SELECT COALESCE(sum(amount), 0)::text AS amount,
              count(*)::text AS paid_orders
       FROM financial_ledger WHERE entry_type = 'BUYER_PAYMENT'`,
    );
    return {
      amount: result.rows[0]?.amount ?? '0',
      paidOrders: Number(result.rows[0]?.paid_orders ?? 0),
      currency: 'UZS' as const,
      demo: true as const,
    };
  }

  async turnoverAnalytics() {
    type DailyRow = { period: string; amount: string; goods: string; delivery: string; platform_fee: string };
    type MonthlyRow = { period: string; amount: string };
    type BreakdownRow = { goods: string; delivery: string; platform_fee: string };
    // One BUYER_PAYMENT ledger entry per order. Escrow parts add up to that buyer amount.
    const daily = await this.database.query<DailyRow>(
      `WITH days AS (
         SELECT generate_series(
           (now() AT TIME ZONE 'Asia/Tashkent')::date - 29,
           (now() AT TIME ZONE 'Asia/Tashkent')::date,
           interval '1 day')::date AS day
       ), paid AS (
         SELECT (f.created_at AT TIME ZONE 'Asia/Tashkent')::date AS day,
                sum(f.amount) AS amount, sum(e.farmer_amount) AS goods,
                sum(e.transporter_amount) AS delivery, sum(e.platform_fee) AS platform_fee
         FROM financial_ledger f JOIN escrow_accounts e ON e.id = f.escrow_id
         WHERE f.entry_type = 'BUYER_PAYMENT'
           AND f.created_at >= (((now() AT TIME ZONE 'Asia/Tashkent')::date - 29)::timestamp AT TIME ZONE 'Asia/Tashkent')
         GROUP BY 1
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS period,
              COALESCE(p.amount, 0)::text AS amount,
              COALESCE(p.goods, 0)::text AS goods,
              COALESCE(p.delivery, 0)::text AS delivery,
              COALESCE(p.platform_fee, 0)::text AS platform_fee
       FROM days d LEFT JOIN paid p ON p.day = d.day ORDER BY d.day`,
    );
    const monthly = await this.database.query<MonthlyRow>(
      `WITH months AS (
         SELECT generate_series(
           date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent') - interval '11 months',
           date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent'),
           interval '1 month')::date AS month
       ), paid AS (
         SELECT date_trunc('month', f.created_at AT TIME ZONE 'Asia/Tashkent')::date AS month,
                sum(f.amount) AS amount
         FROM financial_ledger f
         WHERE f.entry_type = 'BUYER_PAYMENT'
           AND f.created_at >= ((date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent') - interval '11 months') AT TIME ZONE 'Asia/Tashkent')
         GROUP BY 1
       )
       SELECT to_char(m.month, 'YYYY-MM') AS period, COALESCE(p.amount, 0)::text AS amount
       FROM months m LEFT JOIN paid p ON p.month = m.month ORDER BY m.month`,
    );
    const breakdown = await this.database.query<BreakdownRow>(
      `SELECT COALESCE(sum(e.farmer_amount), 0)::text AS goods,
              COALESCE(sum(e.transporter_amount), 0)::text AS delivery,
              COALESCE(sum(e.platform_fee), 0)::text AS platform_fee
       FROM financial_ledger f JOIN escrow_accounts e ON e.id = f.escrow_id
       WHERE f.entry_type = 'BUYER_PAYMENT'`,
    );
    const parts = breakdown.rows[0] ?? { goods: '0', delivery: '0', platform_fee: '0' };
    return {
      daily: daily.rows.map(row => ({ period: row.period, amount: row.amount })),
      monthly: monthly.rows,
      breakdown: { goods: parts.goods, delivery: parts.delivery, platformFee: parts.platform_fee },
      weekly: daily.rows.slice(-7).map(row => ({
        period: row.period, goods: row.goods, delivery: row.delivery, platformFee: row.platform_fee,
      })),
      currency: 'UZS' as const,
      demo: true as const,
    };
  }

  async banUser(userId: string, actorUserId: string) {
    if (userId === actorUserId) throw new ForbiddenException('You cannot ban your own account');
    return this.database.transaction(async (client: PoolClient) => {
      const result = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM users WHERE id = $1 FOR UPDATE', [userId],
      );
      const user = result.rows[0];
      if (!user) throw new NotFoundException('User not found');
      const adminRole = await client.query(
        `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1 AND r.name = 'ADMIN'`, [userId],
      );
      if (adminRole.rowCount) throw new ForbiddenException('Admin accounts cannot be banned here');
      if (user.status === 'SUSPENDED') return { id: user.id, status: 'SUSPENDED' as const };
      if (user.status !== 'ACTIVE' && user.status !== 'PENDING') {
        throw new ConflictException('Account cannot be banned in its current status');
      }
      await client.query(
        "UPDATE users SET status = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [userId],
      );
      await client.query(
        'UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'USER_BANNED', 'USER', $2, $3::jsonb)`,
        [actorUserId, userId, JSON.stringify({ previous_status: user.status, new_status: 'SUSPENDED' })],
      );
      return { id: user.id, status: 'SUSPENDED' as const };
    });
  }

  async users(query: AdminUsersQueryDto) {
    const parts: QueryParts = { where: [], values: [] };
    if (query.status) add(parts, 'u.status =', query.status);
    if (query.role) {
      add(parts, `EXISTS (
        SELECT 1 FROM user_roles fur JOIN roles fr ON fr.id = fur.role_id
        WHERE fur.user_id = u.id AND fr.name =`, query.role);
      parts.where[parts.where.length - 1] += ')';
    }
    const clause = where(parts);
    const count = await this.count(`SELECT count(*) AS total FROM users u ${clause}`, parts.values);
    const result = await this.page<Row>(
      `SELECT u.id, u.phone, u.email, u.full_name, u.status, u.created_at, u.updated_at,
              COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       ${clause}
       GROUP BY u.id
       ORDER BY u.created_at DESC, u.id DESC`,
      parts.values,
      query,
    );
    return this.response(result.rows.map(row => ({
      id: row.id,
      phone: row.phone,
      email: row.email,
      fullName: row.full_name,
      status: row.status,
      roles: row.roles,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    })), query, count);
  }

  async listings(query: AdminListingsQueryDto) {
    const parts: QueryParts = { where: [], values: [] };
    if (query.status) add(parts, 'l.status =', query.status);
    if (query.product_id) add(parts, 'l.product_id =', query.product_id);
    if (query.farmer_id) add(parts, 'l.farmer_id =', query.farmer_id);
    if (query.region) add(parts, 'l.region =', query.region.trim());
    const from = `FROM listings l
      JOIN products p ON p.id = l.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN farmer_profiles fp ON fp.user_id = l.farmer_id
      JOIN users fu ON fu.id = l.farmer_id ${where(parts)}`;
    const count = await this.count(`SELECT count(*) AS total ${from}`, parts.values);
    const result = await this.page<Row>(
      `SELECT l.id, l.title, l.description, l.original_quantity, l.available_quantity,
              l.unit, l.price_per_unit, l.region, l.district, l.latitude, l.longitude,
              l.status, l.created_at, l.updated_at, p.id AS product_id,
              p.name AS product_name, c.id AS category_id, c.name AS category_name,
              fu.id AS farmer_id, fu.full_name AS farmer_name, fp.farm_name
       ${from} ORDER BY l.created_at DESC, l.id DESC`, parts.values, query);
    return this.response(result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      originalQuantity: Number(row.original_quantity),
      availableQuantity: Number(row.available_quantity),
      unit: row.unit,
      pricePerUnit: Number(row.price_per_unit),
      status: row.status,
      location: { region: row.region, district: row.district, latitude: optionalNumber(row.latitude), longitude: optionalNumber(row.longitude) },
      product: { id: row.product_id, name: row.product_name, category: { id: row.category_id, name: row.category_name } },
      farmer: { id: row.farmer_id, fullName: row.farmer_name, farmName: row.farm_name },
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    })), query, count);
  }

  async orders(query: AdminOrdersQueryDto) {
    const parts: QueryParts = { where: [], values: [] };
    if (query.status) add(parts, 'o.status =', query.status);
    if (query.buyer_id) add(parts, 'o.buyer_id =', query.buyer_id);
    if (query.farmer_id) add(parts, 'o.farmer_id =', query.farmer_id);
    const from = `FROM orders o
      JOIN users bu ON bu.id = o.buyer_id
      JOIN users fu ON fu.id = o.farmer_id ${where(parts)}`;
    const count = await this.count(`SELECT count(*) AS total ${from}`, parts.values);
    const result = await this.page<Row>(
      `SELECT o.id, o.status, o.subtotal, o.delivery_fee, o.total_amount,
              o.created_at, o.updated_at, bu.id AS buyer_id, bu.full_name AS buyer_name,
              fu.id AS farmer_id, fu.full_name AS farmer_name,
              (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       ${from} ORDER BY o.created_at DESC, o.id DESC`, parts.values, query);
    return this.response(result.rows.map(row => ({
      id: row.id,
      status: row.status,
      subtotal: Number(row.subtotal),
      deliveryFee: Number(row.delivery_fee),
      totalAmount: Number(row.total_amount),
      itemCount: Number(row.item_count),
      buyer: { id: row.buyer_id, fullName: row.buyer_name },
      farmer: { id: row.farmer_id, fullName: row.farmer_name },
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    })), query, count);
  }

  async shipments(query: AdminShipmentsQueryDto) {
    const parts: QueryParts = { where: [], values: [] };
    if (query.status) add(parts, 's.status =', query.status);
    if (query.order_id) add(parts, 's.order_id =', query.order_id);
    if (query.transporter_id) add(parts, 's.transporter_id =', query.transporter_id);
    const from = `FROM shipments s
      JOIN orders o ON o.id = s.order_id
      LEFT JOIN users tu ON tu.id = s.transporter_id
      LEFT JOIN vehicles v ON v.id = s.vehicle_id ${where(parts)}`;
    const count = await this.count(`SELECT count(*) AS total ${from}`, parts.values);
    const result = await this.page<Row>(
      `SELECT s.id, s.status, s.pickup_latitude, s.pickup_longitude,
              s.destination_latitude, s.destination_longitude, s.pickup_time,
              s.delivered_time, s.created_at, s.updated_at, o.id AS order_id,
              o.status AS order_status, o.total_amount, tu.id AS transporter_id,
              tu.full_name AS transporter_name, v.id AS vehicle_id,
              v.vehicle_type, v.plate_number
       ${from} ORDER BY s.created_at DESC, s.id DESC`, parts.values, query);
    return this.response(result.rows.map(row => ({
      id: row.id,
      status: row.status,
      order: { id: row.order_id, status: row.order_status, totalAmount: Number(row.total_amount) },
      transporter: row.transporter_id === null ? null : { id: row.transporter_id, fullName: row.transporter_name },
      vehicle: row.vehicle_id === null ? null : { id: row.vehicle_id, type: row.vehicle_type, plateNumber: row.plate_number },
      pickup: { latitude: optionalNumber(row.pickup_latitude), longitude: optionalNumber(row.pickup_longitude), time: iso(row.pickup_time) },
      destination: { latitude: optionalNumber(row.destination_latitude), longitude: optionalNumber(row.destination_longitude), deliveredAt: iso(row.delivered_time) },
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    })), query, count);
  }

  async disputes(query: AdminDisputesQueryDto) {
    const parts: QueryParts = { where: [], values: [] };
    if (query.status) add(parts, 'd.status =', query.status);
    if (query.order_id) add(parts, 'd.order_id =', query.order_id);
    if (query.opened_by) add(parts, 'd.opened_by =', query.opened_by);
    const from = `FROM disputes d
      JOIN orders o ON o.id = d.order_id
      JOIN users opener ON opener.id = d.opened_by
      LEFT JOIN users resolver ON resolver.id = d.resolved_by ${where(parts)}`;
    const count = await this.count(`SELECT count(*) AS total ${from}`, parts.values);
    const result = await this.page<Row>(
      `SELECT d.id, d.reason, d.description, d.status, d.resolution,
              d.created_at, d.resolved_at, o.id AS order_id, o.status AS order_status,
              opener.id AS opened_by_id, opener.full_name AS opened_by_name,
              resolver.id AS resolved_by_id, resolver.full_name AS resolved_by_name
       ${from} ORDER BY d.created_at DESC, d.id DESC`, parts.values, query);
    return this.response(result.rows.map(row => ({
      id: row.id,
      reason: row.reason,
      description: row.description,
      status: row.status,
      resolution: row.resolution,
      order: { id: row.order_id, status: row.order_status },
      openedBy: { id: row.opened_by_id, fullName: row.opened_by_name },
      resolvedBy: row.resolved_by_id === null ? null : { id: row.resolved_by_id, fullName: row.resolved_by_name },
      createdAt: iso(row.created_at),
      resolvedAt: iso(row.resolved_at),
    })), query, count);
  }

  approveListing(listingId: string, actorUserId: string) {
    return this.moderateListing(listingId, actorUserId, 'ACTIVE');
  }

  rejectListing(listingId: string, actorUserId: string, reason?: string) {
    return this.moderateListing(listingId, actorUserId, 'REJECTED', reason?.trim());
  }

  private async moderateListing(
    listingId: string,
    actorUserId: string,
    targetStatus: 'ACTIVE' | 'REJECTED',
    reason?: string,
  ) {
    return this.database.transaction(async (client: PoolClient) => {
      const current = await client.query<Row>(
        `SELECT id, title, status
         FROM listings
         WHERE id = $1
         FOR UPDATE`,
        [listingId],
      );
      const listing = current.rows[0];
      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.status !== 'PENDING') {
        throw new ConflictException(`Listing in ${String(listing.status)} status cannot be moderated`);
      }

      const updated = await client.query<Row>(
        `UPDATE listings
         SET status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PENDING'
         RETURNING id, title, status, updated_at`,
        [listingId, targetStatus],
      );
      const result = updated.rows[0];
      if (!result) throw new ConflictException('Listing status changed concurrently');

      const metadata: Record<string, string> = {
        previous_status: 'PENDING',
        new_status: targetStatus,
      };
      if (reason) metadata.reason = reason;
      const action = targetStatus === 'ACTIVE' ? 'LISTING_APPROVED' : 'LISTING_REJECTED';
      const audit = await client.query<Row>(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'LISTING', $3, $4::jsonb)
         RETURNING id, action, created_at`,
        [actorUserId, action, listingId, JSON.stringify(metadata)],
      );
      const auditRow = audit.rows[0];

      return {
        listing: {
          id: result.id,
          title: result.title,
          status: result.status,
          updatedAt: iso(result.updated_at),
        },
        moderation: {
          action: auditRow?.action ?? action,
          reason: reason ?? null,
          auditLogId: auditRow?.id,
          createdAt: iso(auditRow?.created_at),
        },
      };
    });
  }

  private async count(sql: string, values: unknown[]): Promise<number> {
    const result = await this.database.query<{ total: string }>(sql, values);
    return Number(result.rows[0]?.total ?? 0);
  }

  private page<T extends QueryResultRow>(sql: string, values: unknown[], query: AdminPaginationDto) {
    const paged = [...values, query.page_size, (query.page - 1) * query.page_size];
    return this.database.query<T>(
      `${sql} LIMIT $${paged.length - 1} OFFSET $${paged.length}`,
      paged,
    );
  }

  private response<T>(data: T[], query: AdminPaginationDto, totalItems: number) {
    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.page_size,
        totalItems,
        totalPages: Math.ceil(totalItems / query.page_size),
      },
    };
  }
}
