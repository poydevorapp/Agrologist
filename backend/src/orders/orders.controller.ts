import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { CreateOrderDto } from './orders.dto.js';
import { OrdersService } from './orders.service.js';

@Roles('BUYER')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateOrderDto) {
    return this.orders.create(user.id, input);
  }

  @Get('farmer')
  @Roles('FARMER')
  findForFarmer(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.findForFarmer(user.id);
  }

  @Get('my')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.orders.findForBuyer(user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.findBuyerOrder(id, user.id);
  }

  @Get(':id/transport-offers')
  @Roles('FARMER')
  transportOffers(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.findTransportOffers(id, user.id);
  }
}
