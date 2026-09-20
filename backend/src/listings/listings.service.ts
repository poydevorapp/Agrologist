import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { CreateListingDto, ListingUnit, UpdateListingDto } from './listings.dto.js';

type ListingStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'RESERVED' | 'SOLD' | 'CANCELLED' | 'REJECTED';
type ListingRow = {
  id: string;
  farmer_id: string;
  product_id: string;
  title: string;
  description: string | null;
  original_quantity: string;
  available_quantity: string;
  unit: ListingUnit;
  price_per_unit: string;
  region: string;
  district: string;
  latitude: string | null;
  longitude: string | null;
  status: ListingStatus;
  created_at: Date;
  updated_at: Date;
};

export type ListingResponse = {
  id: string;
  productId: string;
  title: string;
  description: string | null;
  originalQuantity: number;
  availableQuantity: number;
  unit: ListingUnit;
  pricePerUnit: number;
  region: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS = `id, farmer_id, product_id, title, description, original_quantity,
  available_quantity, unit, price_per_unit, region, district, latitude, longitude,
  status, created_at, updated_at`;
const EDITABLE = new Set<ListingStatus>(['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED']);

@Injectable()
export class ListingsService {
  constructor(private readonly database: DatabaseService) {}

  async create(farmerId: string, input: CreateListingDto): Promise<ListingResponse> {
    this.validateText(input);
    this.validateCoordinates(input.latitude, input.longitude);
    return this.database.transaction(async (client) => {
      await this.requireFarmerProfile(client, farmerId);
      await this.requireProduct(client, input.productId, input.unit);
      const result = await client.query<ListingRow>(
        `INSERT INTO listings
          (farmer_id, product_id, title, description, original_quantity,
           available_quantity, unit, price_per_unit, region, district, latitude, longitude, status)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, 'PENDING')
         RETURNING ${COLUMNS}`,
        [farmerId, input.productId, input.title.trim(), input.description?.trim() ?? null,
          input.quantity, input.unit, input.pricePerUnit, input.region.trim(), input.district.trim(),
          input.latitude ?? null, input.longitude ?? null],
      );
      return this.toResponse(result.rows[0]!);
    });
  }

  async findMine(farmerId: string): Promise<ListingResponse[]> {
    const result = await this.database.query<ListingRow>(
      `SELECT ${COLUMNS} FROM listings WHERE farmer_id = $1 ORDER BY created_at DESC, id DESC`,
      [farmerId],
    );
    return result.rows.map((row) => this.toResponse(row));
  }

  async salesInsights(farmerId: string) {
    const result = await this.database.query<{
      product_id: string; product_name: string; unit: ListingUnit;
      quantity: string; revenue: string; order_count: string;
    }>(
      `SELECT p.id AS product_id, p.name AS product_name, l.unit,
              sum(oi.quantity)::text AS quantity, sum(oi.line_total)::text AS revenue,
              count(DISTINCT o.id)::text AS order_count
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN listings l ON l.id = oi.listing_id AND l.farmer_id = $1
       JOIN products p ON p.id = l.product_id
       WHERE o.farmer_id = $1 AND o.status = 'COMPLETED'
         AND EXISTS (SELECT 1 FROM financial_ledger f
                     WHERE f.order_id = o.id AND f.entry_type = 'BUYER_PAYMENT')
       GROUP BY p.id, p.name, l.unit
       ORDER BY sum(oi.line_total) DESC, p.name, p.id, l.unit
       LIMIT 10`,
      [farmerId],
    );
    return { products: result.rows.map(row => ({
      productId: row.product_id, productName: row.product_name, unit: row.unit,
      quantity: row.quantity, revenue: row.revenue, orderCount: Number(row.order_count),
    })), currency: 'UZS' as const };
  }

  async catalog() {
    const result = await this.database.query<{
      category_id: string;
      category_name: string;
      product_id: string;
      product_name: string;
      unit_type: ListingUnit;
    }>(
      `SELECT c.id AS category_id, c.name AS category_name,
              p.id AS product_id, p.name AS product_name, p.unit_type
       FROM categories c
       JOIN products p ON p.category_id = c.id AND p.active = TRUE
       WHERE c.active = TRUE
       ORDER BY c.name, p.name`,
    );
    const categories = new Map<string, {
      id: string;
      name: string;
      products: Array<{ id: string; name: string; unit: ListingUnit }>;
    }>();
    for (const row of result.rows) {
      const category = categories.get(row.category_id) ?? {
        id: row.category_id,
        name: row.category_name,
        products: [],
      };
      category.products.push({ id: row.product_id, name: row.product_name, unit: row.unit_type });
      categories.set(row.category_id, category);
    }
    return { categories: [...categories.values()] };
  }

  async findOwned(id: string, farmerId: string): Promise<ListingResponse> {
    const result = await this.database.query<ListingRow>(
      `SELECT ${COLUMNS} FROM listings WHERE id = $1 AND farmer_id = $2`,
      [id, farmerId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Listing not found');
    return this.toResponse(row);
  }

  async update(id: string, farmerId: string, input: UpdateListingDto): Promise<ListingResponse> {
    if (Object.values(input).every(value => value === undefined)) throw new BadRequestException('At least one field is required');
    this.validateText(input);
    // Transformed DTOs own optional fields even when the request omitted them.
    const hasLatitude = input.latitude !== undefined;
    const hasLongitude = input.longitude !== undefined;
    if (hasLatitude !== hasLongitude) throw new BadRequestException('Latitude and longitude must be provided together');
    if (hasLatitude) this.validateCoordinates(input.latitude, input.longitude);

    return this.database.transaction(async (client) => {
      const currentResult = await client.query<ListingRow>(
        `SELECT ${COLUMNS} FROM listings WHERE id = $1 AND farmer_id = $2 FOR UPDATE`,
        [id, farmerId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException('Listing not found');
      if (!EDITABLE.has(current.status)) throw new ConflictException(`Listing in ${current.status} status cannot be edited`);

      const productId = input.productId ?? current.product_id;
      const unit = input.unit ?? current.unit;
      await this.requireProduct(client, productId, unit);

      const committedQuantity = Number(current.original_quantity) - Number(current.available_quantity);
      const originalQuantity = input.quantity ?? Number(current.original_quantity);
      if (originalQuantity < committedQuantity) {
        throw new ConflictException('Quantity cannot be lower than already reserved or sold quantity');
      }
      const availableQuantity = originalQuantity - committedQuantity;
      const result = await client.query<ListingRow>(
        `UPDATE listings SET
           product_id = $3, title = $4, description = $5,
           original_quantity = $6, available_quantity = $7, unit = $8,
           price_per_unit = $9, region = $10, district = $11,
           latitude = $12, longitude = $13,
           status = CASE WHEN status IN ('DRAFT', 'REJECTED') THEN 'PENDING' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND farmer_id = $2
         RETURNING ${COLUMNS}`,
        [id, farmerId, productId, input.title?.trim() ?? current.title,
          input.description !== undefined ? input.description?.trim() ?? null : current.description,
          originalQuantity, availableQuantity, unit, input.pricePerUnit ?? Number(current.price_per_unit),
          input.region?.trim() ?? current.region, input.district?.trim() ?? current.district,
          hasLatitude ? input.latitude ?? null : current.latitude,
          hasLongitude ? input.longitude ?? null : current.longitude],
      );
      return this.toResponse(result.rows[0]!);
    });
  }

  async cancel(id: string, farmerId: string): Promise<ListingResponse> {
    const result = await this.database.query<ListingRow>(
      `UPDATE listings SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND farmer_id = $2
         AND status IN ('DRAFT', 'PENDING', 'ACTIVE', 'REJECTED')
       RETURNING ${COLUMNS}`,
      [id, farmerId],
    );
    const row = result.rows[0];
    if (!row) throw new ConflictException('Listing can no longer be cancelled');
    return this.toResponse(row);
  }

  private async requireFarmerProfile(client: PoolClient, farmerId: string): Promise<void> {
    const result = await client.query('SELECT 1 FROM farmer_profiles WHERE user_id = $1', [farmerId]);
    if (!result.rowCount) throw new ForbiddenException('Farmer profile is required');
  }

  private async requireProduct(client: PoolClient, productId: string, unit: ListingUnit): Promise<void> {
    const result = await client.query(
      'SELECT 1 FROM products WHERE id = $1 AND active = TRUE AND unit_type = $2',
      [productId, unit],
    );
    if (!result.rowCount) throw new BadRequestException('Active product with matching unit is required');
  }

  private validateCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): void {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException('Latitude and longitude must be provided together');
    }
  }

  private validateText(input: CreateListingDto | UpdateListingDto): void {
    for (const key of ['title', 'region', 'district', 'description'] as const) {
      const value = input[key];
      if (typeof value === 'string' && !value.trim()) throw new BadRequestException(`${key} cannot be blank`);
    }
  }

  private toResponse(row: ListingRow): ListingResponse {
    return {
      id: row.id,
      productId: row.product_id,
      title: row.title,
      description: row.description,
      originalQuantity: Number(row.original_quantity),
      availableQuantity: Number(row.available_quantity),
      unit: row.unit,
      pricePerUnit: Number(row.price_per_unit),
      region: row.region,
      district: row.district,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
