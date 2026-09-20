import { BadRequestException, Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { DeliveryAcceptanceService } from './delivery-acceptance.service.js';

@Controller('orders')
@Roles('BUYER')
export class DeliveryAcceptanceController {
  constructor(private readonly acceptance: DeliveryAcceptanceService) {}

  @Post(':id/accept-delivery')
  @HttpCode(200)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser,
    @Body() input: unknown) {
    if (input != null && (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)) {
      throw new BadRequestException('Delivery acceptance accepts an empty body only');
    }
    return this.acceptance.accept(id, user.id);
  }
}
