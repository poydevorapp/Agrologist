import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { AvailableTransportQueryDto, CreateTransportOfferDto, CreateVehicleDto } from './transport.dto.js';
import { TransportService } from './transport.service.js';

@Roles('TRANSPORTER')
@Controller('transport')
export class TransportController {
  constructor(private readonly transport: TransportService) {}

  @Get('available')
  available(@Query() query: AvailableTransportQueryDto) {
    return this.transport.available(query);
  }

  @Get('vehicles')
  vehicles(@CurrentUser() user: AuthenticatedUser) {
    return this.transport.vehicles(user.id);
  }

  @Post('vehicles')
  createVehicle(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateVehicleDto) {
    return this.transport.createVehicle(user.id, input);
  }

  @Get('deliveries')
  deliveries(@CurrentUser() user: AuthenticatedUser) {
    return this.transport.deliveries(user.id);
  }

  @Get('shipments/:id')
  shipment(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transport.shipment(user.id, id);
  }

  @Get('shipments/:id/quote')
  quote(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string,
    @Query('vehicle_id', ParseUUIDPipe) vehicleId: string) {
    return this.transport.quote(id, user.id, vehicleId);
  }

  @Post('offers')
  createOffer(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateTransportOfferDto) {
    return this.transport.createOffer(user.id, input);
  }
}
