import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { OrderLifecycleController } from './order-lifecycle.controller.js';
import { OrderLifecycleService } from './order-lifecycle.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [OrdersController, OrderLifecycleController],
  providers: [OrdersService, OrderLifecycleService],
})
export class OrdersModule {}
