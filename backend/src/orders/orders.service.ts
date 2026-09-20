import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CreateOrderDto } from './orders.dto.js';

type ReservationRow = {
  listing_id: string;
  farmer_id: string;
  unit_price: string;
  reserved_quantity: string;
  remaining_quantity: string;
};

type OrderRow = {
  id: string;
  farmer_id: string;
  status: string;
  subtotal: string;
  delivery_fee: string;
  total_amount: string;
  created_at: Date;
  updated_at: Date;
};

type OrderItemRow = {
  id: string;
  listing_id: string;
  quantity: string;
  unit_price: string;
  line_total: string;
};

@Injectable()
export class OrdersService {
  constructor(private readonly database: DatabaseService) {}

  async findTransportOffers(orderId: string, farmerId: string) {
    const order = await this.database.query<{ shipment_id: string | null; shipment_status: string | null }>(
      `SELECT s.id AS shipment_id, s.status AS shipment_status
       FROM orders o LEFT JOIN shipments s ON s.order_id = o.id
       WHERE o.id = $1 AND o.farmer_id = $2`,
      [orderId, farmerId],
    );
    if (!order.rows[0]) throw new NotFoundException('Order not found');
    const shipment = order.rows[0];
    if (!shipment.shipment_id) return { shipment: null, offers: [] };
    const offers = await this.database.query<{
      id: string; status: string; offered_price: string; created_at: Date;
      transporter_id: string; transporter_name: string; vehicle_id: string;
      vehicle_type: string; plate_number: string;
    }>(
      `SELECT t.id, t.status, t.offered_price, t.created_at,
              u.id AS transporter_id, u.full_name AS transporter_name,
              v.id AS vehicle_id, v.vehicle_type, v.plate_number
       FROM transport_offers t
       JOIN users u ON u.id = t.transporter_id AND u.status = 'ACTIVE'
       JOIN vehicles v ON v.id = t.vehicle_id AND v.transporter_id = t.transporter_id
       WHERE t.shipment_id = $1 AND t.status = 'PENDING'
       ORDER BY t.offered_price ASC, t.created_at ASC, t.id ASC`,
      [shipment.shipment_id],
    );
    return {
      shipment: { id: shipment.shipment_id, status: shipment.shipment_status },
      offers: offers.rows.map((offer) => ({
        id: offer.id,
        status: offer.status,
        offeredPrice: Number(offer.offered_price),
        transporter: { id: offer.transporter_id, fullName: offer.transporter_name },
        vehicle: { id: offer.vehicle_id, type: offer.vehicle_type, plateNumber: offer.plate_number },
        createdAt: offer.created_at.toISOString(),
      })),
    };
  }

  async findForBuyer(buyerId: string) {
    const result = await this.database.query<{
      id: string; status: string; subtotal: string; delivery_fee: string; total_amount: string;
      created_at: Date; updated_at: Date; farmer_id: string; farmer_name: string;
      item_count: string; shipment_status: string | null; payment_status: string | null;
    }>(
      `SELECT o.id, o.status, o.subtotal, o.delivery_fee, o.total_amount,
              o.created_at, o.updated_at, u.id AS farmer_id, u.full_name AS farmer_name,
              (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              s.status AS shipment_status,
              (SELECT p.status FROM payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1) AS payment_status
       FROM orders o
       JOIN users u ON u.id = o.farmer_id
       LEFT JOIN shipments s ON s.order_id = o.id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC, o.id DESC`,
      [buyerId],
    );
    return result.rows.map((row) => ({
      id: row.id, status: row.status, subtotal: Number(row.subtotal),
      deliveryFee: Number(row.delivery_fee), totalAmount: Number(row.total_amount),
      farmer: { id: row.farmer_id, fullName: row.farmer_name },
      itemCount: Number(row.item_count), shipmentStatus: row.shipment_status,
      paymentStatus: row.payment_status, createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async findBuyerOrder(orderId: string, buyerId: string) {
    const orderResult = await this.database.query<{
      id: string; status: string; subtotal: string; delivery_fee: string; total_amount: string;
      platform_fee: string; payable_amount: string;
      created_at: Date; updated_at: Date; farmer_id: string; farmer_name: string;
    }>(
      `SELECT o.id, o.status, o.subtotal, o.delivery_fee, o.total_amount,
              round(o.total_amount * 0.003, 2) AS platform_fee,
              o.total_amount + round(o.total_amount * 0.003, 2) AS payable_amount,
              o.created_at, o.updated_at, u.id AS farmer_id, u.full_name AS farmer_name
       FROM orders o JOIN users u ON u.id = o.farmer_id
       WHERE o.id = $1 AND o.buyer_id = $2`,
      [orderId, buyerId],
    );
    const order = orderResult.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    const [itemsResult, shipmentResult, paymentResult, escrowResult] = await Promise.all([
      this.database.query<{
        id: string; listing_id: string; listing_title: string; product_name: string;
        quantity: string; unit_price: string; line_total: string;
      }>(
        `SELECT oi.id, oi.listing_id, l.title AS listing_title, p.name AS product_name,
                oi.quantity, oi.unit_price, oi.line_total
         FROM order_items oi JOIN listings l ON l.id = oi.listing_id
         JOIN products p ON p.id = l.product_id WHERE oi.order_id = $1 ORDER BY oi.id`, [orderId],
      ),
      this.database.query<{
        id: string; status: string; pickup_time: Date | null; delivered_time: Date | null;
        transporter_name: string | null; vehicle_type: string | null; plate_number: string | null;
        pickup_region: string; pickup_district: string; pickup_latitude: string | null; pickup_longitude: string | null;
        destination_region: string; destination_district: string; destination_latitude: string | null; destination_longitude: string | null;
      }>(
        `SELECT s.id, s.status, s.pickup_time, s.delivered_time,
                tu.full_name AS transporter_name, v.vehicle_type, v.plate_number,
                pickup.region AS pickup_region, pickup.district AS pickup_district,
                COALESCE(s.pickup_latitude, pickup.latitude) AS pickup_latitude,
                COALESCE(s.pickup_longitude, pickup.longitude) AS pickup_longitude,
                bp.region AS destination_region, bp.district AS destination_district,
                s.destination_latitude, s.destination_longitude
         FROM shipments s
         JOIN orders shipment_order ON shipment_order.id = s.order_id
         JOIN buyer_profiles bp ON bp.user_id = shipment_order.buyer_id
         JOIN LATERAL (
           SELECT l.region, l.district, l.latitude, l.longitude
           FROM order_items oi JOIN listings l ON l.id = oi.listing_id
           WHERE oi.order_id = s.order_id ORDER BY oi.id LIMIT 1
         ) pickup ON TRUE
         LEFT JOIN users tu ON tu.id = s.transporter_id
         LEFT JOIN vehicles v ON v.id = s.vehicle_id
         WHERE s.order_id = $1`, [orderId],
      ),
      this.database.query<{ provider: string; status: string; amount: string }>(
        `SELECT provider, status, amount FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId],
      ),
      this.database.query<{ status: string; gross_amount: string; released_at: Date | null }>(
        `SELECT status, gross_amount, released_at FROM escrow_accounts WHERE order_id = $1`, [orderId],
      ),
    ]);
    const shipment = shipmentResult.rows[0];
    const events = shipment ? await this.database.query<{
      id: string; event_type: string; latitude: string | null; longitude: string | null; created_at: Date;
    }>(
      `SELECT id, event_type, latitude, longitude, created_at
       FROM shipment_events WHERE shipment_id = $1 ORDER BY created_at, id`, [shipment.id],
    ) : { rows: [] };
    const payment = paymentResult.rows[0];
    const escrow = escrowResult.rows[0];
    return {
      id: order.id, status: order.status, subtotal: Number(order.subtotal),
      deliveryFee: Number(order.delivery_fee), totalAmount: Number(order.total_amount),
      demoPaymentQuote: { platformFee: Number(order.platform_fee), payableTotal: Number(order.payable_amount) },
      farmer: { id: order.farmer_id, fullName: order.farmer_name },
      items: itemsResult.rows.map((item) => ({
        id: item.id, listingId: item.listing_id, listingTitle: item.listing_title,
        productName: item.product_name, quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price), lineTotal: Number(item.line_total),
      })),
      shipment: shipment ? {
        id: shipment.id, status: shipment.status,
        pickupTime: shipment.pickup_time?.toISOString() ?? null,
        deliveredTime: shipment.delivered_time?.toISOString() ?? null,
        transporterName: shipment.transporter_name,
        vehicle: shipment.vehicle_type ? { type: shipment.vehicle_type, plateNumber: shipment.plate_number } : null,
        pickup: {
          region: shipment.pickup_region, district: shipment.pickup_district,
          latitude: shipment.pickup_latitude === null ? null : Number(shipment.pickup_latitude),
          longitude: shipment.pickup_longitude === null ? null : Number(shipment.pickup_longitude),
        },
        destination: {
          region: shipment.destination_region, district: shipment.destination_district,
          latitude: shipment.destination_latitude === null ? null : Number(shipment.destination_latitude),
          longitude: shipment.destination_longitude === null ? null : Number(shipment.destination_longitude),
        },
        events: events.rows.map((event) => ({
          id: event.id, type: event.event_type,
          latitude: event.latitude === null ? null : Number(event.latitude),
          longitude: event.longitude === null ? null : Number(event.longitude),
          createdAt: event.created_at.toISOString(),
        })),
      } : null,
      payment: payment ? { provider: payment.provider, status: payment.status, amount: Number(payment.amount) } : null,
      escrow: escrow ? { status: escrow.status, grossAmount: Number(escrow.gross_amount), releasedAt: escrow.released_at?.toISOString() ?? null } : null,
      availableActions: {
        // The UI must wait for the accepted delivery price before offering payment.
        demoPay: ['TRANSPORT_ASSIGNED', 'IN_TRANSIT', 'DELIVERED'].includes(order.status) && payment?.status !== 'PAID',
        acceptDelivery: order.status === 'DELIVERED' && ['LOCKED', 'FUNDED'].includes(escrow?.status ?? ''),
      },
      createdAt: order.created_at.toISOString(), updatedAt: order.updated_at.toISOString(),
    };
  }

  async findForFarmer(farmerId: string) {
    const result = await this.database.query<{
      id: string;
      status: string;
      subtotal: string;
      delivery_fee: string;
      total_amount: string;
      created_at: Date;
      updated_at: Date;
      buyer_id: string;
      buyer_name: string;
      items: Array<{
        id: string;
        listingId: string;
        productName: string;
        listingTitle: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }>;
    }>(
      `SELECT o.id, o.status, o.subtotal, o.delivery_fee, o.total_amount,
              o.created_at, o.updated_at, u.id AS buyer_id, u.full_name AS buyer_name,
              json_agg(json_build_object(
                'id', oi.id,
                'listingId', oi.listing_id,
                'productName', p.name,
                'listingTitle', l.title,
                'quantity', oi.quantity,
                'unitPrice', oi.unit_price,
                'lineTotal', oi.line_total
              ) ORDER BY oi.id) AS items
       FROM orders o
       JOIN users u ON u.id = o.buyer_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN listings l ON l.id = oi.listing_id
       JOIN products p ON p.id = l.product_id
       WHERE o.farmer_id = $1
       GROUP BY o.id, u.id
       ORDER BY o.created_at DESC, o.id DESC`,
      [farmerId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      subtotal: Number(row.subtotal),
      deliveryFee: Number(row.delivery_fee),
      totalAmount: Number(row.total_amount),
      buyer: { id: row.buyer_id, fullName: row.buyer_name },
      items: row.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async create(buyerId: string, input: CreateOrderDto) {
    try {
      return await this.database.transaction(async (client) => {
        const buyer = await client.query('SELECT 1 FROM buyer_profiles WHERE user_id = $1', [buyerId]);
        if (!buyer.rowCount) throw new ForbiddenException('Buyer profile is required');

        // This function locks the listing row until this transaction commits or rolls back.
        const reservationResult = await client.query<ReservationRow>(
          `SELECT listing_id, farmer_id, unit_price, reserved_quantity, remaining_quantity
           FROM reserve_listing_stock($1, $2)`,
          [input.listing_id, input.quantity],
        );
        const reservation = reservationResult.rows[0]!;
        if (reservation.farmer_id === buyerId) {
          throw new ForbiddenException('A farmer cannot order their own listing');
        }
        const farmer = await client.query<{ status: string }>(
          'SELECT status FROM users WHERE id = $1 FOR SHARE', [reservation.farmer_id],
        );
        if (farmer.rows[0]?.status !== 'ACTIVE') {
          throw new ConflictException('Farmer account is not active');
        }

        // Supplies actor context to the existing order-status history trigger.
        await client.query("SELECT set_config('app.changed_by', $1, true)", [buyerId]);
        const orderResult = await client.query<OrderRow>(
          `INSERT INTO orders (buyer_id, farmer_id, subtotal, total_amount)
           VALUES ($1, $2, round($3::numeric * $4::numeric, 2), round($3::numeric * $4::numeric, 2))
           RETURNING id, farmer_id, status, subtotal, delivery_fee, total_amount, created_at, updated_at`,
          [buyerId, reservation.farmer_id, reservation.reserved_quantity, reservation.unit_price],
        );
        const order = orderResult.rows[0]!;
        const itemResult = await client.query<OrderItemRow>(
          `INSERT INTO order_items (order_id, listing_id, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, listing_id, quantity, unit_price, line_total`,
          [order.id, reservation.listing_id, reservation.reserved_quantity,
            reservation.unit_price, order.subtotal],
        );
        const item = itemResult.rows[0]!;
        return {
          id: order.id,
          farmerId: order.farmer_id,
          status: order.status,
          subtotal: Number(order.subtotal),
          deliveryFee: Number(order.delivery_fee),
          totalAmount: Number(order.total_amount),
          items: [{
            id: item.id,
            listingId: item.listing_id,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            lineTotal: Number(item.line_total),
          }],
          createdAt: order.created_at.toISOString(),
          updatedAt: order.updated_at.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = (error as { code?: string }).code;
      if (code === 'P0002') throw new NotFoundException('Listing not found');
      if (code === '55000') throw new ConflictException('Listing is not available');
      if (code === '23514') throw new ConflictException('Insufficient available stock');
      if (code === '22023') throw new BadRequestException('Invalid quantity');
      throw error;
    }
  }
}
