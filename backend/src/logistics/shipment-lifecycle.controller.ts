import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { ShipmentLifecycleService } from './shipment-lifecycle.service.js';

@Controller()
export class ShipmentLifecycleController {
  constructor(private readonly lifecycle: ShipmentLifecycleService) {}

  @Post('transport/offers/:id/accept')
  @Roles('FARMER', 'ADMIN')
  acceptOffer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.acceptOffer(id, user);
  }

  @Post('shipments/:id/picked-up')
  @Roles('TRANSPORTER')
  pickedUp(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.transition(id, 'PICKED_UP', user);
  }

  @Post('shipments/:id/in-transit')
  @Roles('TRANSPORTER')
  inTransit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.transition(id, 'IN_TRANSIT', user);
  }

  @Post('shipments/:id/delivered')
  @Roles('TRANSPORTER')
  delivered(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.transition(id, 'DELIVERED', user);
  }
}
