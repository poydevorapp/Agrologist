import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { DatabaseService } from '../database/database.service.js';
import { ORDER_TRANSITIONS, OrderAction, OrderRelation, OrderStatus, TransitionRule } from './order-lifecycle.js';

type OrderRow = {
  id: string;
  buyer_id: string;
  farmer_id: string;
  status: OrderStatus;
};

type HistoryRow = {
  previous_status: OrderStatus;
  new_status: OrderStatus;
  changed_by: string;
  note: string | null;
  created_at: Date;
};

@Injectable()
export class OrderLifecycleService {
  constructor(private readonly database: DatabaseService) {}

  async transition(orderId: string, action: OrderAction, actor: AuthenticatedUser, note?: string) {
    const rule = ORDER_TRANSITIONS[action];
    return this.database.transaction(async (client) => {
      const result = await client.query<OrderRow>(
        'SELECT id, buyer_id, farmer_id, status FROM orders WHERE id = $1 FOR UPDATE',
        [orderId],
      );
      const order = result.rows[0];
      if (!order) throw new NotFoundException('Order not found');

      await this.authorize(client, order, rule, actor);
      if (action === 'COMPLETE') {
        throw new ConflictException('Use accept-delivery to complete the order and release demo escrow atomically');
      }
      if (!rule.from.includes(order.status)) {
        throw new ConflictException(`Cannot ${action} an order in ${order.status} status`);
      }

      // Shipment actions own these synchronized transitions; the generic route must not bypass them.
      if (['ASSIGN_TRANSPORT', 'START_TRANSIT', 'MARK_DELIVERED'].includes(action)) {
        throw new ConflictException('Use transport offer acceptance or the shipment status action');
      }

      if (action === 'REQUEST_TRANSPORT') {
        await client.query('INSERT INTO shipments (order_id) VALUES ($1) ON CONFLICT (order_id) DO NOTHING', [order.id]);
      }

      if (rule.to === 'CANCELLED') {
        const funded = await client.query(
          `SELECT 1 FROM payments WHERE order_id = $1 AND status = 'PAID'
           UNION ALL SELECT 1 FROM escrow_accounts WHERE order_id = $1 AND status <> 'CREATED'`, [order.id],
        );
        if (funded.rowCount) throw new ConflictException('Funded orders cannot be cancelled without a refund workflow');
        await this.restoreReservedStock(client, order.id);
      }
      await client.query("SELECT set_config('app.changed_by', $1, true)", [actor.id]);
      await client.query("SELECT set_config('app.status_note', $1, true)", [note?.trim() ?? '']);
      const update = await client.query<{ updated_at: Date }>(
        `UPDATE orders SET status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = $3
         RETURNING updated_at`,
        [order.id, rule.to, order.status],
      );
      if (!update.rowCount) throw new ConflictException('Order status changed concurrently');

      // The existing trigger writes this row in the same transaction as the update.
      const historyResult = await client.query<HistoryRow>(
        `SELECT previous_status, new_status, changed_by, note, created_at
         FROM order_status_history
         WHERE order_id = $1 AND previous_status = $2 AND new_status = $3 AND changed_by = $4
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [order.id, order.status, rule.to, actor.id],
      );
      const history = historyResult.rows[0];
      if (!history) throw new Error('Order status history was not recorded');
      return {
        orderId: order.id,
        previousStatus: history.previous_status,
        status: history.new_status,
        changedBy: history.changed_by,
        note: history.note,
        changedAt: history.created_at.toISOString(),
      };
    });
  }

  private async authorize(
    client: PoolClient,
    order: OrderRow,
    rule: TransitionRule,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (actor.roles.includes('ADMIN')) return;
    if (!rule.roles.some((role) => actor.roles.includes(role))) {
      throw new ForbiddenException('Role cannot perform this order action');
    }
    const ownsRelationship = await this.hasRelationship(client, order, rule.relation, actor.id);
    if (!ownsRelationship) throw new NotFoundException('Order not found');
  }

  private async hasRelationship(
    client: PoolClient,
    order: OrderRow,
    relation: OrderRelation,
    actorId: string,
  ): Promise<boolean> {
    if (relation === 'BUYER') return order.buyer_id === actorId;
    if (relation === 'FARMER') return order.farmer_id === actorId;
    if (relation === 'PARTICIPANT') return order.buyer_id === actorId || order.farmer_id === actorId;
    if (relation === 'ADMIN') return false;
    const shipment = await client.query(
      'SELECT 1 FROM shipments WHERE order_id = $1 AND transporter_id = $2',
      [order.id, actorId],
    );
    return Boolean(shipment.rowCount);
  }

  private async restoreReservedStock(client: PoolClient, orderId: string): Promise<void> {
    const itemCount = await client.query<{ count: string }>(
      'SELECT count(*) AS count FROM order_items WHERE order_id = $1',
      [orderId],
    );
    const restored = await client.query(
      `UPDATE listings l
       SET available_quantity = l.available_quantity + oi.quantity,
           status = CASE WHEN l.status = 'RESERVED' THEN 'ACTIVE' ELSE l.status END,
           updated_at = CURRENT_TIMESTAMP
       FROM order_items oi
       WHERE oi.order_id = $1 AND oi.listing_id = l.id
         AND l.available_quantity + oi.quantity <= l.original_quantity`,
      [orderId],
    );
    if ((restored.rowCount ?? 0) !== Number(itemCount.rows[0]?.count ?? 0)) {
      throw new ConflictException('Unable to restore reserved stock safely');
    }
  }
}
