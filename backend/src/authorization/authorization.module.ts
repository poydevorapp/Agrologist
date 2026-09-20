import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { JwtAuthenticationGuard } from './jwt-authentication.guard.js';
import { OwnershipService } from './ownership.service.js';
import { ResourceOwnerGuard } from './resource-owner.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  providers: [
    OwnershipService,
    { provide: APP_GUARD, useClass: JwtAuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ResourceOwnerGuard },
  ],
  exports: [OwnershipService],
})
export class AuthorizationModule {}
