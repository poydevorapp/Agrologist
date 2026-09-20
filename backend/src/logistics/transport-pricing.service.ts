import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { RouteDistanceService } from './route-distance.service.js';

// Demo tariffs are vehicle-specific; the accepted offer keeps the amount as its snapshot.
const TARIFFS = {
  MOTORCYCLE: { baseFare: 8_000, perRoadKm: 900, perKg: 8 },
  PICKUP: { baseFare: 10_000, perRoadKm: 1_500, perKg: 10 },
  VAN: { baseFare: 12_000, perRoadKm: 1_650, perKg: 12 },
  TRUCK: { baseFare: 10_000, perRoadKm: 1_800, perKg: 15 },
  TRACTOR_TRAILER: { baseFare: 15_000, perRoadKm: 2_100, perKg: 18 },
} as const;
const PRICING_VERSION = 'DEMO_V2';

type QuoteRow = {
  shipment_status: string;
  assigned_transporter_id: string | null;
  order_status: string;
  weight_kg: string | null;
  pickup_region: string;
  pickup_district: string;
  pickup_latitude: string | null;
  pickup_longitude: string | null;
  destination_region: string;
  destination_district: string;
  destination_latitude: string | null;
  destination_longitude: string | null;
};

@Injectable()
export class TransportPricingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly routes: RouteDistanceService,
  ) {}

  async quote(shipmentId: string, transporterId: string, vehicleId: string) {
    const vehicle = (await this.database.query<{
      vehicle_type: string; capacity_kg: string; status: string;
    }>(
      'SELECT vehicle_type, capacity_kg, status FROM vehicles WHERE id = $1 AND transporter_id = $2',
      [vehicleId, transporterId],
    )).rows[0];
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.status !== 'ACTIVE') throw new ConflictException('Vehicle is not active');
    const tariff = TARIFFS[vehicle.vehicle_type as keyof typeof TARIFFS];
    if (!tariff) throw new ConflictException('Vehicle type has no delivery tariff');
    const result = await this.database.query<QuoteRow>(
      `SELECT s.status AS shipment_status, s.transporter_id AS assigned_transporter_id,
              o.status AS order_status,
              CASE WHEN bool_and(l.unit IN ('KG', 'TON'))
                THEN sum(CASE WHEN l.unit = 'TON' THEN oi.quantity * 1000 ELSE oi.quantity END)
                ELSE NULL END AS weight_kg,
              min(l.region) AS pickup_region, min(l.district) AS pickup_district,
              COALESCE(s.pickup_latitude, min(l.latitude)) AS pickup_latitude,
              COALESCE(s.pickup_longitude, min(l.longitude)) AS pickup_longitude,
              bp.region AS destination_region, bp.district AS destination_district,
              s.destination_latitude, s.destination_longitude
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       JOIN buyer_profiles bp ON bp.user_id = o.buyer_id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN listings l ON l.id = oi.listing_id
       WHERE s.id = $1
       GROUP BY s.id, o.id, bp.user_id`,
      [shipmentId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Shipment not found');
    if (row.shipment_status !== 'PENDING' || row.assigned_transporter_id !== null
      || row.order_status !== 'TRANSPORT_PENDING') {
      throw new ConflictException('Shipment is not available for offers');
    }
    const weightKg = row.weight_kg === null ? null : Number(row.weight_kg);
    if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) {
      throw new ConflictException('Cargo weight in kg is required for a fair delivery quote');
    }
    if (weightKg > Number(vehicle.capacity_kg)) throw new ConflictException('Vehicle capacity is insufficient');
    const route = await this.routes.calculate(
      {
        region: row.pickup_region, district: row.pickup_district,
        latitude: row.pickup_latitude === null ? null : Number(row.pickup_latitude),
        longitude: row.pickup_longitude === null ? null : Number(row.pickup_longitude),
      },
      {
        region: row.destination_region, district: row.destination_district,
        latitude: row.destination_latitude === null ? null : Number(row.destination_latitude),
        longitude: row.destination_longitude === null ? null : Number(row.destination_longitude),
      },
    );
    const total = Math.round((tariff.baseFare + route.distanceKm * tariff.perRoadKm
      + weightKg * tariff.perKg) * 100) / 100;
    return {
      shipmentId, vehicleId, vehicleType: vehicle.vehicle_type, pricingVersion: PRICING_VERSION,
      distanceKm: route.distanceKm, weightKg, approximate: route.approximate,
      baseFare: tariff.baseFare, perRoadKm: tariff.perRoadKm, perKg: tariff.perKg, total,
      currency: 'UZS',
    };
  }
}
