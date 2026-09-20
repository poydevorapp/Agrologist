import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { TransportController } from './transport.controller.js';
import { TransportService } from './transport.service.js';
import { ShipmentLifecycleController } from './shipment-lifecycle.controller.js';
import { ShipmentLifecycleService } from './shipment-lifecycle.service.js';
import { RouteDistanceService } from './route-distance.service.js';
import { TransportPricingService } from './transport-pricing.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [TransportController, ShipmentLifecycleController],
  providers: [TransportService, ShipmentLifecycleService, RouteDistanceService, TransportPricingService],
})
export class LogisticsModule {}
