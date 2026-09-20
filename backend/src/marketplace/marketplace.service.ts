import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { MarketplaceListingsQueryDto } from './marketplace.dto.js';

type MarketplaceRow = {
  id: string;
  title: string;
  status: 'ACTIVE';
  description: string | null;
  available_quantity: string;
  unit: 'KG' | 'TON' | 'PIECE';
  price_per_unit: string;
  region: string;
  district: string;
  latitude: string | null;
  longitude: string | null;
  created_at: Date;
  updated_at: Date;
  product_id: string;
  product_name: string;
  product_unit_type: 'KG' | 'TON' | 'PIECE';
  category_id: string;
  category_name: string;
  farm_name: string | null;
  farmer_region: string;
  farmer_district: string;
  farmer_verification_status: string;
};

export type MarketplaceListingResponse = {
  id: string;
  title: string;
  status: 'ACTIVE';
  description: string | null;
  availableQuantity: number;
  unit: 'KG' | 'TON' | 'PIECE';
  pricePerUnit: number;
  location: { region: string; district: string; latitude: number | null; longitude: number | null };
  product: { id: string; name: string; unitType: string; category: { id: string; name: string } };
  farmer: { farmName: string | null; region: string; district: string; verificationStatus: string };
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class MarketplaceService {
  constructor(private readonly database: DatabaseService) {}

  async findListings(query: MarketplaceListingsQueryDto) {
    if (query.min_price !== undefined && query.max_price !== undefined && query.min_price > query.max_price) {
      throw new BadRequestException('min_price cannot be greater than max_price');
    }

    const values: unknown[] = [];
    const where = ["l.status = 'ACTIVE'", 'l.available_quantity > 0'];
    const add = (clause: string, value: unknown): void => {
      values.push(value);
      where.push(`${clause} $${values.length}`);
    };
    if (query.product_id) add('l.product_id =', query.product_id);
    if (query.category_id) add('p.category_id =', query.category_id);
    if (query.region) add('l.region =', query.region.trim());
    if (query.district) add('l.district =', query.district.trim());
    if (query.min_price !== undefined) add('l.price_per_unit >=', query.min_price);
    if (query.max_price !== undefined) add('l.price_per_unit <=', query.max_price);

    const from = `FROM listings l
      JOIN products p ON p.id = l.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN farmer_profiles fp ON fp.user_id = l.farmer_id
      JOIN users fu ON fu.id = l.farmer_id AND fu.status = 'ACTIVE'
      WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query<{ total: string }>(`SELECT count(*) AS total ${from}`, values);
    const totalItems = Number(countResult.rows[0]?.total ?? 0);
    const page = query.page;
    const pageSize = query.page_size;
    const offset = (page - 1) * pageSize;
    const direction = query.sort_order === 'asc' ? 'ASC' : 'DESC';
    const dataValues = [...values, pageSize, offset];
    const result = await this.database.query<MarketplaceRow>(
      `SELECT l.id, l.title, l.status, l.description, l.available_quantity, l.unit,
              l.price_per_unit, l.region, l.district, l.latitude, l.longitude,
              l.created_at, l.updated_at,
              p.id AS product_id, p.name AS product_name, p.unit_type AS product_unit_type,
              c.id AS category_id, c.name AS category_name,
              fp.farm_name, fp.region AS farmer_region, fp.district AS farmer_district,
              fp.verification_status AS farmer_verification_status
       ${from}
       ORDER BY l.created_at ${direction}, l.id ${direction}
       LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
      dataValues,
    );

    return {
      data: result.rows.map((row) => this.toResponse(row)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
      sort: { field: 'createdAt', order: query.sort_order },
    };
  }

  async findListing(id: string): Promise<MarketplaceListingResponse> {
    const result = await this.database.query<MarketplaceRow>(
      `SELECT l.id, l.title, l.status, l.description, l.available_quantity, l.unit,
              l.price_per_unit, l.region, l.district, l.latitude, l.longitude,
              l.created_at, l.updated_at,
              p.id AS product_id, p.name AS product_name, p.unit_type AS product_unit_type,
              c.id AS category_id, c.name AS category_name,
              fp.farm_name, fp.region AS farmer_region, fp.district AS farmer_district,
              fp.verification_status AS farmer_verification_status
       FROM listings l
       JOIN products p ON p.id = l.product_id
       JOIN categories c ON c.id = p.category_id
       JOIN farmer_profiles fp ON fp.user_id = l.farmer_id
       JOIN users fu ON fu.id = l.farmer_id AND fu.status = 'ACTIVE'
       WHERE l.id = $1 AND l.status = 'ACTIVE' AND l.available_quantity > 0`,
      [id],
    );
    const listing = result.rows[0];
    if (!listing) throw new NotFoundException('Marketplace listing not found');
    return this.toResponse(listing);
  }

  async catalog() {
    const result = await this.database.query<{
      category_id: string;
      category_name: string;
      product_id: string;
      product_name: string;
      unit_type: string;
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
      products: Array<{ id: string; name: string; unit: string }>;
    }>();
    for (const row of result.rows) {
      const category = categories.get(row.category_id) ?? {
        id: row.category_id, name: row.category_name, products: [],
      };
      category.products.push({ id: row.product_id, name: row.product_name, unit: row.unit_type });
      categories.set(row.category_id, category);
    }
    return { categories: [...categories.values()] };
  }

  private toResponse(row: MarketplaceRow): MarketplaceListingResponse {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      description: row.description,
      availableQuantity: Number(row.available_quantity),
      unit: row.unit,
      pricePerUnit: Number(row.price_per_unit),
      location: {
        region: row.region,
        district: row.district,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
      },
      product: {
        id: row.product_id,
        name: row.product_name,
        unitType: row.product_unit_type,
        category: { id: row.category_id, name: row.category_name },
      },
      farmer: {
        farmName: row.farm_name,
        region: row.farmer_region,
        district: row.farmer_district,
        verificationStatus: row.farmer_verification_status,
      },
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
