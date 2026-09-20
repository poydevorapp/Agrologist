import { BadRequestException, Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { DemoPaymentService } from './demo-payment.service.js';

@Controller('orders')
@Roles('BUYER')
export class DemoPaymentController {
  constructor(private readonly payments: DemoPaymentService) {}

  @Post(':id/demo-pay')
  @HttpCode(200)
  pay(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser,
    @Body() input: unknown) {
    if (input != null && (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)) {
      throw new BadRequestException('Demo payment accepts an empty body only');
    }
    return this.payments.pay(id, user.id);
  }
}
