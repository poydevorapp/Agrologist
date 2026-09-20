import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { OwnedResource } from './authorization.types.js';

const RELATIONSHIP_SQL: Record<Exclude<OwnedResource, 'SELF'>, string> = {
  LISTING: 'SELECT 1 FROM listings WHERE id = $1 AND farmer_id = $2',
  BUYER_ORDER: 'SELECT 1 FROM orders WHERE id = $1 AND buyer_id = $2',
  FARMER_ORDER: 'SELECT 1 FROM orders WHERE id = $1 AND farmer_id = $2',
  TRANSPORT_SHIPMENT: 'SELECT 1 FROM shipments WHERE id = $1 AND transporter_id = $2',
  TRANSPORT_VEHICLE: 'SELECT 1 FROM vehicles WHERE id = $1 AND transporter_id = $2',
};

@Injectable()
export class OwnershipService {
  constructor(private readonly database: DatabaseService) {}

  async owns(resource: OwnedResource, resourceId: string, userId: string): Promise<boolean> {
    if (resource === 'SELF') return resourceId === userId;
    const result = await this.database.query(RELATIONSHIP_SQL[resource], [resourceId, userId]);
    return (result.rowCount ?? 0) > 0;
  }
}
