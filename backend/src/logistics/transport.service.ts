import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { AvailableTransportQueryDto, CreateTransportOfferDto, CreateVehicleDto } from './transport.dto.js';
import { TransportPricingService } from './transport-pricing.service.js';

type AvailableShipmentRow = {
  id: string;
  order_id: string;
  order_status: string;
  total_amount: string;
  item_count: string;
  cargo_summary: string;
  required_capacity_kg: string | null;
  pickup_region: string;
  pickup_district: string;
  pickup_latitude: string | null;
  pickup_longitude: string | null;
  destination_region: string;
  destination_district: string;
  destination_latitude: string | null;
  destination_longitude: string | null;
  created_at: Date;
};

type ShipmentRow = { id: string; order_id: string; status: string; transporter_id: string | null };
type VehicleRow = { id: string; vehicle_type: string; capacity_kg: string; status: string };
type CapacityRow = { required_capacity_kg: string | null };
type OfferRow = {
  id: string;
  shipment_id: string;
  vehicle_id: string;
  offered_price: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type TransportVehicleRow = {
  id: string;
  vehicle_type: string;
  plate_number: string;
  capacity_kg: string;
  refrigerated: boolean;
  status: string;
};

type TransportShipmentRow = AvailableShipmentRow & {
  shipment_status: string;
  pickup_time: Date | null;
  delivered_time: Date | null;
  updated_at: Date;
  vehicle_id: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  vehicle_capacity_kg: string | null;
  refrigerated: boolean | null;
  accepted_price: string | null;
};

type ShipmentEventRow = {
  id: string;
  event_type: string;
  latitude: string | null;
  longitude: string | null;
  created_at: Date;
};

const CAPACITY_SQL = `CASE
  WHEN bool_and(l.unit IN ('KG', 'TON')) THEN
    sum(CASE WHEN l.unit = 'TON' THEN oi.quantity * 1000 ELSE oi.quantity END)
  ELSE NULL
END`;

const nextShipmentAction = (status: string) => {
  if (status === 'ASSIGNED') return 'PICKED_UP';
  if (status === 'PICKED_UP') return 'IN_TRANSIT';
  if (status === 'IN_TRANSIT') return 'DELIVERED';
  return null;
};

const mapShipment = (row: TransportShipmentRow) => ({
  shipmentId: row.id,
  status: row.shipment_status,
  order: {
    id: row.order_id,
    status: row.order_status,
    totalAmount: Number(row.total_amount),
    itemCount: Number(row.item_count),
  },
  load: {
    summary: row.cargo_summary,
    requiredCapacityKg: row.required_capacity_kg === null ? null : Number(row.required_capacity_kg),
    capacityKnown: row.required_capacity_kg !== null,
  },
  pickup: {
    region: row.pickup_region,
    district: row.pickup_district,
    latitude: row.pickup_latitude === null ? null : Number(row.pickup_latitude),
    longitude: row.pickup_longitude === null ? null : Number(row.pickup_longitude),
    time: row.pickup_time?.toISOString() ?? null,
  },
  destination: {
    region: row.destination_region,
    district: row.destination_district,
    latitude: row.destination_latitude === null ? null : Number(row.destination_latitude),
    longitude: row.destination_longitude === null ? null : Number(row.destination_longitude),
    deliveredTime: row.delivered_time?.toISOString() ?? null,
  },
  vehicle: row.vehicle_id === null ? null : {
    id: row.vehicle_id,
    type: row.vehicle_type,
    plateNumber: row.plate_number,
    capacityKg: row.vehicle_capacity_kg === null ? null : Number(row.vehicle_capacity_kg),
    refrigerated: row.refrigerated,
  },
  acceptedPrice: row.accepted_price === null ? null : Number(row.accepted_price),
  availableAction: nextShipmentAction(row.shipment_status),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

@Injectable()
export class TransportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly pricing: TransportPricingService,
  ) {}

  quote(shipmentId: string, transporterId: string, vehicleId: string) {
    return this.pricing.quote(shipmentId, transporterId, vehicleId);
  }

  async available(query: AvailableTransportQueryDto) {
    const count = await this.database.query<{ total: string }>(
      `SELECT count(*) AS total
       FROM shipments s JOIN orders o ON o.id = s.order_id
       WHERE s.status = 'PENDING' AND s.transporter_id IS NULL AND s.vehicle_id IS NULL
         AND o.status = 'TRANSPORT_PENDING'`,
    );
    const totalItems = Number(count.rows[0]?.total ?? 0);
    const offset = (query.page - 1) * query.page_size;
    const result = await this.database.query<AvailableShipmentRow>(
      `SELECT s.id, s.order_id, o.status AS order_status, o.total_amount,
              count(oi.id)::text AS item_count,
              string_agg(p.name || ' x ' || oi.quantity || ' ' || l.unit, ', ' ORDER BY oi.id) AS cargo_summary,
              ${CAPACITY_SQL} AS required_capacity_kg,
              min(l.region) AS pickup_region, min(l.district) AS pickup_district,
              COALESCE(s.pickup_latitude, min(l.latitude)) AS pickup_latitude,
              COALESCE(s.pickup_longitude, min(l.longitude)) AS pickup_longitude,
              bp.region AS destination_region, bp.district AS destination_district,
              s.destination_latitude, s.destination_longitude, s.created_at
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       JOIN buyer_profiles bp ON bp.user_id = o.buyer_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN listings l ON l.id = oi.listing_id
       JOIN products p ON p.id = l.product_id
       WHERE s.status = 'PENDING' AND s.transporter_id IS NULL AND s.vehicle_id IS NULL
         AND o.status = 'TRANSPORT_PENDING'
       GROUP BY s.id, s.order_id, o.status, o.total_amount, bp.region, bp.district
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT $1 OFFSET $2`,
      [query.page_size, offset],
    );
    return {
      data: result.rows.map((row) => ({
        shipmentId: row.id,
        status: 'PENDING',
        order: {
          id: row.order_id,
          status: row.order_status,
          totalAmount: Number(row.total_amount),
          itemCount: Number(row.item_count),
        },
        load: {
          summary: row.cargo_summary,
          requiredCapacityKg: row.required_capacity_kg === null ? null : Number(row.required_capacity_kg),
          capacityKnown: row.required_capacity_kg !== null,
        },
        pickup: {
          region: row.pickup_region,
          district: row.pickup_district,
          latitude: row.pickup_latitude === null ? null : Number(row.pickup_latitude),
          longitude: row.pickup_longitude === null ? null : Number(row.pickup_longitude),
        },
        destination: {
          region: row.destination_region,
          district: row.destination_district,
          latitude: row.destination_latitude === null ? null : Number(row.destination_latitude),
          longitude: row.destination_longitude === null ? null : Number(row.destination_longitude),
        },
        createdAt: row.created_at.toISOString(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.page_size,
        totalItems,
        totalPages: Math.ceil(totalItems / query.page_size),
      },
    };
  }

  async vehicles(transporterId: string) {
    const result = await this.database.query<TransportVehicleRow>(
      `SELECT id, vehicle_type, plate_number, capacity_kg, refrigerated, status
       FROM vehicles
       WHERE transporter_id = $1
       ORDER BY status = 'ACTIVE' DESC, created_at DESC`,
      [transporterId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      type: row.vehicle_type,
      plateNumber: row.plate_number,
      capacityKg: Number(row.capacity_kg),
      refrigerated: row.refrigerated,
      status: row.status,
    }));
  }

  async createVehicle(transporterId: string, input: CreateVehicleDto) {
    const plateNumber = input.plate_number.replace(/\s+/g, '').toUpperCase();
    try {
      const result = await this.database.query<TransportVehicleRow>(
        `INSERT INTO vehicles (transporter_id, vehicle_type, plate_number, capacity_kg, refrigerated)
         SELECT user_id, $2, $3, $4, $5
         FROM transporter_profiles WHERE user_id = $1
         RETURNING id, vehicle_type, plate_number, capacity_kg, refrigerated, status`,
        [transporterId, input.vehicle_type, plateNumber, input.capacity_kg, input.refrigerated ?? false],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException('Transporter profile not found');
      return {
        id: row.id, type: row.vehicle_type, plateNumber: row.plate_number,
        capacityKg: Number(row.capacity_kg), refrigerated: row.refrigerated, status: row.status,
      };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Plate number is already registered');
      }
      throw error;
    }
  }

  async deliveries(transporterId: string) {
    const result = await this.database.query<TransportShipmentRow>(
      `${this.shipmentSelect()}
       WHERE s.transporter_id = $1
       GROUP BY s.id, s.order_id, s.status, o.status, o.total_amount, bp.region, bp.district,
                v.id, v.vehicle_type, v.plate_number, v.capacity_kg, v.refrigerated, accepted.offered_price
       ORDER BY CASE WHEN s.status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT') THEN 0 ELSE 1 END,
                s.updated_at DESC`,
      [transporterId],
    );
    return result.rows.map(mapShipment);
  }

  async shipment(transporterId: string, shipmentId: string) {
    const result = await this.database.query<TransportShipmentRow>(
      `${this.shipmentSelect()}
       WHERE s.id = $1
         AND (s.transporter_id = $2 OR (
           s.status = 'PENDING' AND s.transporter_id IS NULL AND s.vehicle_id IS NULL
           AND o.status = 'TRANSPORT_PENDING'
         ))
       GROUP BY s.id, s.order_id, s.status, o.status, o.total_amount, bp.region, bp.district,
                v.id, v.vehicle_type, v.plate_number, v.capacity_kg, v.refrigerated, accepted.offered_price`,
      [shipmentId, transporterId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Shipment not found');

    const offer = await this.database.query<OfferRow>(
      `SELECT id, shipment_id, vehicle_id, offered_price, status, created_at, updated_at
       FROM transport_offers
       WHERE shipment_id = $1 AND transporter_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [shipmentId, transporterId],
    );
    const events = row.shipment_status === 'PENDING'
      ? { rows: [] as ShipmentEventRow[] }
      : await this.database.query<ShipmentEventRow>(
        `SELECT id, event_type, latitude, longitude, created_at
         FROM shipment_events WHERE shipment_id = $1 ORDER BY created_at ASC, id ASC`,
        [shipmentId],
      );
    const ownOffer = offer.rows[0];
    return {
      ...mapShipment(row),
      ownOffer: ownOffer ? {
        id: ownOffer.id,
        vehicleId: ownOffer.vehicle_id,
        offeredPrice: Number(ownOffer.offered_price),
        status: ownOffer.status,
        createdAt: ownOffer.created_at.toISOString(),
      } : null,
      events: events.rows.map((event) => ({
        id: event.id,
        type: event.event_type,
        latitude: event.latitude === null ? null : Number(event.latitude),
        longitude: event.longitude === null ? null : Number(event.longitude),
        createdAt: event.created_at.toISOString(),
      })),
    };
  }

  async createOffer(transporterId: string, input: CreateTransportOfferDto) {
    // A quote is calculated before locking the shipment; ownership, capacity and
    // unchanged weight are checked again under the transaction lock below.
    const vehicleOwner = await this.database.query(
      'SELECT 1 FROM vehicles WHERE id = $1 AND transporter_id = $2',
      [input.vehicle_id, transporterId],
    );
    if (!vehicleOwner.rowCount) throw new NotFoundException('Vehicle not found');
    const quote = await this.pricing.quote(input.shipment_id, transporterId, input.vehicle_id);
    try {
      return await this.database.transaction(async (client) => {
        const transporter = await client.query<{ availability_status: string }>(
          'SELECT availability_status FROM transporter_profiles WHERE user_id = $1',
          [transporterId],
        );
        if (transporter.rows[0]?.availability_status !== 'AVAILABLE') {
          throw new ConflictException('Transporter must be available');
        }
        const shipmentResult = await client.query<ShipmentRow>(
          `SELECT s.id, s.order_id, s.status, s.transporter_id
           FROM shipments s JOIN orders o ON o.id = s.order_id
           WHERE s.id = $1
           FOR UPDATE OF s`,
          [input.shipment_id],
        );
        const shipment = shipmentResult.rows[0];
        if (!shipment) throw new NotFoundException('Shipment not found');
        const ready = await client.query(
          `SELECT 1 FROM orders
           WHERE id = $1 AND status = 'TRANSPORT_PENDING'`,
          [shipment.order_id],
        );
        if (shipment.status !== 'PENDING' || shipment.transporter_id !== null || !ready.rowCount) {
          throw new ConflictException('Shipment is not available for offers');
        }

        const vehicleResult = await client.query<VehicleRow>(
          `SELECT id, vehicle_type, capacity_kg, status FROM vehicles
           WHERE id = $1 AND transporter_id = $2
           FOR SHARE`,
          [input.vehicle_id, transporterId],
        );
        const vehicle = vehicleResult.rows[0];
        if (!vehicle) throw new NotFoundException('Vehicle not found');
        if (vehicle.status !== 'ACTIVE') throw new ConflictException('Vehicle is not active');
        if (vehicle.vehicle_type !== quote.vehicleType) {
          throw new ConflictException('Vehicle type changed; refresh the delivery quote');
        }

        const capacity = await client.query<CapacityRow>(
          `SELECT ${CAPACITY_SQL} AS required_capacity_kg
           FROM order_items oi JOIN listings l ON l.id = oi.listing_id
           WHERE oi.order_id = $1`,
          [shipment.order_id],
        );
        const required = capacity.rows[0]?.required_capacity_kg;
        if (required !== null && required !== undefined && Number(required) > Number(vehicle.capacity_kg)) {
          throw new ConflictException('Vehicle capacity is insufficient');
        }
        if (required === null || required === undefined || Number(required) !== quote.weightKg) {
          throw new ConflictException('Cargo weight changed; refresh the delivery quote');
        }

        const offer = await client.query<OfferRow>(
          `INSERT INTO transport_offers (shipment_id, transporter_id, vehicle_id, offered_price)
           VALUES ($1, $2, $3, $4)
           RETURNING id, shipment_id, vehicle_id, offered_price, status, created_at, updated_at`,
          [shipment.id, transporterId, vehicle.id, quote.total],
        );
        const row = offer.rows[0]!;
        return {
          id: row.id,
          shipmentId: row.shipment_id,
          vehicleId: row.vehicle_id,
          offeredPrice: Number(row.offered_price),
          quote,
          status: row.status,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('An active offer already exists for this shipment');
      }
      throw error;
    }
  }

  private shipmentSelect() {
    return `SELECT s.id, s.order_id, s.status AS shipment_status, o.status AS order_status, o.total_amount,
                   count(oi.id)::text AS item_count,
                   string_agg(p.name || ' x ' || oi.quantity || ' ' || l.unit, ', ' ORDER BY oi.id) AS cargo_summary,
                   ${CAPACITY_SQL} AS required_capacity_kg,
                   min(l.region) AS pickup_region, min(l.district) AS pickup_district,
                   COALESCE(s.pickup_latitude, min(l.latitude)) AS pickup_latitude,
                   COALESCE(s.pickup_longitude, min(l.longitude)) AS pickup_longitude,
                   bp.region AS destination_region, bp.district AS destination_district,
                   s.destination_latitude, s.destination_longitude, s.pickup_time, s.delivered_time,
                   s.created_at, s.updated_at,
                   v.id AS vehicle_id, v.vehicle_type, v.plate_number,
                   v.capacity_kg AS vehicle_capacity_kg, v.refrigerated,
                   accepted.offered_price AS accepted_price
            FROM shipments s
            JOIN orders o ON o.id = s.order_id
            JOIN buyer_profiles bp ON bp.user_id = o.buyer_id
            JOIN order_items oi ON oi.order_id = o.id
            JOIN listings l ON l.id = oi.listing_id
            JOIN products p ON p.id = l.product_id
            LEFT JOIN vehicles v ON v.id = s.vehicle_id
            LEFT JOIN transport_offers accepted
              ON accepted.shipment_id = s.id AND accepted.status = 'ACCEPTED'`;
  }
}
