import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { LogisticsModule } from './logistics/logistics.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { AdminModule } from './admin/admin.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { MarketplaceModule } from './marketplace/marketplace.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment }),
    HealthModule,
    AuthModule,
    AuthorizationModule,
    UsersModule,
    ListingsModule,
    MarketplaceModule,
    OrdersModule,
    LogisticsModule,
    PaymentsModule,
    AdminModule,
  ],
})
export class AppModule {}
