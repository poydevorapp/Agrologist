import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Roles } from '../authorization/authorization.decorators.js';
import { MarketplaceListingsQueryDto } from './marketplace.dto.js';
import { MarketplaceService } from './marketplace.service.js';

@Roles('BUYER')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('listings')
  findListings(@Query() query: MarketplaceListingsQueryDto) {
    return this.marketplace.findListings(query);
  }

  @Get('catalog')
  catalog() {
    return this.marketplace.catalog();
  }

  @Get('listings/:id')
  findListing(@Param('id', ParseUUIDPipe) id: string) {
    return this.marketplace.findListing(id);
  }
}
