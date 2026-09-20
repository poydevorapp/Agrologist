import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
