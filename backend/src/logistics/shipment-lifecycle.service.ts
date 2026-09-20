import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { DatabaseService } from '../database/database.service.js';

type ShipmentStatus = 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
type ShipmentAction = 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED';
type ShipmentRow = {
  id: string;
  order_id: string;
  transporter_id: string | null;
  vehicle_id: string | null;
  status: ShipmentStatus;
  order_status: string;
};

type OfferRow = {
  id: string;
  shipment_id: string;
  transporter_id: string;
  vehicle_id: string;
  offered_price: string;
  status: string;
  vehicle_status: string;
  availability_status: string;
  transporter_status: string;
};

const SHIPMENT_TRANSITIONS: Record<ShipmentAction, {
  from: ShipmentStatus;
  to: ShipmentStatus;
  orderFrom?: string;
  orderTo?: string;
}> = {
  PICKED_UP: { from: 'ASSIGNED', to: 'PICKED_UP' },
  IN_TRANSIT: { from: 'PICKED_UP', to: 'IN_TRANSIT', orderFrom: 'TRANSPORT_ASSIGNED', orderTo: 'IN_TRANSIT' },
  DELIVERED: { from: 'IN_TRANSIT', to: 'DELIVERED', orderFrom: 'IN_TRANSIT', orderTo: 'DELIVERED' },
};

@Injectable()
export class ShipmentLifecycleService {
  constructor(private readonly database: DatabaseService) {}

  async acceptOffer(offerId: string, actor: AuthenticatedUser) {
    return this.database.transaction(async (client) => {
      const reference = await client.query<{ shipment_id: string }>(
        'SELECT shipment_id FROM transport_offers WHERE id = $1',
        [offerId],
      );
      if (!reference.rows[0]) throw new NotFoundException('Transport offer not found');

      // Every acceptance for the same shipment serializes on this row.
      const shipmentResult = await client.query<ShipmentRow & { farmer_id: string }>(
        `SELECT s.id, s.order_id, s.transporter_id, s.vehicle_id, s.status,
                o.status AS order_status, o.farmer_id
         FROM shipments s JOIN orders o ON o.id = s.order_id
         WHERE s.id = $1
         FOR UPDATE OF s, o`,
        [reference.rows[0].shipment_id],
      );
      const shipment = shipmentResult.rows[0];
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (!actor.roles.includes('ADMIN') && shipment.farmer_id !== actor.id) {
        throw new NotFoundException('Transport offer not found');
      }
      if (shipment.status !== 'PENDING' || shipment.transporter_id !== null || shipment.vehicle_id !== null ||
          shipment.order_status !== 'TRANSPORT_PENDING') {
        throw new ConflictException('Shipment is no longer available for assignment');
      }

      const offerResult = await client.query<OfferRow>(
        `SELECT t.id, t.shipment_id, t.transporter_id, t.vehicle_id, t.offered_price, t.status,
                v.status AS vehicle_status, tp.availability_status, tu.status AS transporter_status
         FROM transport_offers t
         JOIN vehicles v ON v.id = t.vehicle_id AND v.transporter_id = t.transporter_id
         JOIN transporter_profiles tp ON tp.user_id = t.transporter_id
         JOIN users tu ON tu.id = t.transporter_id
         WHERE t.id = $1 AND t.shipment_id = $2
         FOR UPDATE OF t, v, tp, tu`,
        [offerId, shipment.id],
      );
      const offer = offerResult.rows[0];
      if (!offer) throw new NotFoundException('Transport offer not found');
      if (offer.status !== 'PENDING') throw new ConflictException('Transport offer is no longer pending');
      if (offer.vehicle_status !== 'ACTIVE') throw new ConflictException('Offered vehicle is not active');
      if (offer.availability_status !== 'AVAILABLE') throw new ConflictException('Transporter is not available');
      if (offer.transporter_status !== 'ACTIVE') throw new ConflictException('Transporter account is not active');

      // The order lock also serializes payment. Never change amounts after financial records exist.
      const financialState = await client.query(
        `SELECT 1 FROM orders o WHERE o.id = $1 AND o.delivery_fee <> $2::numeric AND (
          EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
          OR EXISTS (SELECT 1 FROM escrow_accounts e WHERE e.order_id = o.id))`,
        [shipment.order_id, offer.offered_price],
      );
      if (financialState.rowCount) {
        throw new ConflictException('Delivery price must be agreed before payment; existing financial amounts cannot be changed');
      }

      await client.query(
        `UPDATE transport_offers SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
         WHERE shipment_id = $1 AND id <> $2 AND status = 'PENDING'`,
        [shipment.id, offer.id],
      );
      await client.query(
        `UPDATE transport_offers SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'PENDING'`,
        [offer.id],
      );
      await client.query(
        `UPDATE shipments SET transporter_id = $2, vehicle_id = $3, status = 'ASSIGNED',
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [shipment.id, offer.transporter_id, offer.vehicle_id],
      );
      await client.query(
        "UPDATE transporter_profiles SET availability_status = 'BUSY', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1",
        [offer.transporter_id],
      );
      const event = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO shipment_events (shipment_id, event_type, created_by)
         VALUES ($1, 'ASSIGNED', $2) RETURNING id, created_at`,
        [shipment.id, actor.id],
      );
      await this.setOrderActor(client, actor.id, 'Transport offer accepted');
      const order = await client.query<{ status: string }>(
        `UPDATE orders SET status = 'TRANSPORT_ASSIGNED', delivery_fee = $2,
           total_amount = subtotal + $2::numeric, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'TRANSPORT_PENDING' RETURNING status`,
        [shipment.order_id, offer.offered_price],
      );
      if (!order.rowCount) throw new ConflictException('Order is not ready for transport assignment');

      return {
        offer: {
          id: offer.id,
          status: 'ACCEPTED',
          offeredPrice: Number(offer.offered_price),
        },
        shipment: {
          id: shipment.id,
          status: 'ASSIGNED',
          transporterId: offer.transporter_id,
          vehicleId: offer.vehicle_id,
        },
        order: { id: shipment.order_id, status: order.rows[0]!.status },
        event: { id: event.rows[0]!.id, type: 'ASSIGNED', createdAt: event.rows[0]!.created_at.toISOString() },
      };
    });
  }

  async transition(shipmentId: string, action: ShipmentAction, actor: AuthenticatedUser) {
    const rule = SHIPMENT_TRANSITIONS[action];
    return this.database.transaction(async (client) => {
      const result = await client.query<ShipmentRow>(
        `SELECT s.id, s.order_id, s.transporter_id, s.vehicle_id, s.status, o.status AS order_status
         FROM shipments s JOIN orders o ON o.id = s.order_id
         WHERE s.id = $1 FOR UPDATE OF s, o`,
        [shipmentId],
      );
      const shipment = result.rows[0];
      if (!shipment || shipment.transporter_id !== actor.id) throw new NotFoundException('Shipment not found');
      if (shipment.status !== rule.from) {
        throw new ConflictException(`Cannot mark shipment ${action} from ${shipment.status}`);
      }
      if (rule.orderFrom && shipment.order_status !== rule.orderFrom) {
        throw new ConflictException(`Order is not in ${rule.orderFrom} status`);
      }

      const update = await client.query<{
        status: ShipmentStatus; pickup_time: Date | null; delivered_time: Date | null; updated_at: Date;
      }>(
        `UPDATE shipments SET status = $2,
           pickup_time = CASE WHEN $2 = 'PICKED_UP' THEN CURRENT_TIMESTAMP ELSE pickup_time END,
           delivered_time = CASE WHEN $2 = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE delivered_time END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = $3
         RETURNING status, pickup_time, delivered_time, updated_at`,
        [shipment.id, rule.to, rule.from],
      );
      if (!update.rowCount) throw new ConflictException('Shipment status changed concurrently');
      const event = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO shipment_events (shipment_id, event_type, created_by)
         VALUES ($1, $2, $3) RETURNING id, created_at`,
        [shipment.id, rule.to, actor.id],
      );

      let orderStatus = shipment.order_status;
      if (rule.orderTo && rule.orderFrom) {
        await this.setOrderActor(client, actor.id, `Shipment ${rule.to}`);
        const order = await client.query<{ status: string }>(
          `UPDATE orders SET status = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = $3 RETURNING status`,
          [shipment.order_id, rule.orderTo, rule.orderFrom],
        );
        if (!order.rowCount) throw new ConflictException('Order status changed concurrently');
        orderStatus = order.rows[0]!.status;
      }
      if (rule.to === 'DELIVERED') {
        await client.query(
          "UPDATE transporter_profiles SET availability_status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1",
          [actor.id],
        );
      }
      const row = update.rows[0]!;
      return {
        shipment: {
          id: shipment.id,
          status: row.status,
          pickupTime: row.pickup_time?.toISOString() ?? null,
          deliveredTime: row.delivered_time?.toISOString() ?? null,
          updatedAt: row.updated_at.toISOString(),
        },
        order: { id: shipment.order_id, status: orderStatus },
        event: { id: event.rows[0]!.id, type: rule.to, createdAt: event.rows[0]!.created_at.toISOString() },
      };
    });
  }

  private async setOrderActor(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, actorId: string, note: string) {
    await client.query("SELECT set_config('app.changed_by', $1, true)", [actorId]);
    await client.query("SELECT set_config('app.status_note', $1, true)", [note]);
  }
}
