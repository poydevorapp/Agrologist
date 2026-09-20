import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CurrentUser,
  ResourceOwner,
  Roles,
} from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { CreateListingDto, UpdateListingDto } from './listings.dto.js';
import { ListingsService } from './listings.service.js';

@Roles('FARMER')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateListingDto) {
    return this.listings.create(user.id, input);
  }

  @Get('my')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.listings.findMine(user.id);
  }

  @Get('catalog')
  catalog() {
    return this.listings.catalog();
  }

  @Get('sales-insights')
  salesInsights(@CurrentUser() user: AuthenticatedUser) {
    return this.listings.salesInsights(user.id);
  }

  @Get(':id')
  @ResourceOwner('LISTING', 'id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.listings.findOwned(id, user.id);
  }

  @Patch(':id')
  @ResourceOwner('LISTING', 'id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateListingDto,
  ) {
    return this.listings.update(id, user.id, input);
  }

  @Post(':id/cancel')
  @ResourceOwner('LISTING', 'id')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.listings.cancel(id, user.id);
  }
}
