import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { DemoPaymentController } from './demo-payment.controller.js';
import { DemoPaymentService } from './demo-payment.service.js';
import { DeliveryAcceptanceController } from './delivery-acceptance.controller.js';
import { DeliveryAcceptanceService } from './delivery-acceptance.service.js';
import { DemoWalletController } from './demo-wallet.controller.js';
import { DemoWalletService } from './demo-wallet.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [DemoPaymentController, DeliveryAcceptanceController, DemoWalletController],
  providers: [DemoPaymentService, DeliveryAcceptanceService, DemoWalletService],
})
export class PaymentsModule {}
