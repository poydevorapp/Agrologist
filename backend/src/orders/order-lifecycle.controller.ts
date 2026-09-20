import { Body, Controller, Param, ParseEnumPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { OrderAction } from './order-lifecycle.js';
import { TransitionOrderDto } from './order-lifecycle.dto.js';
import { OrderLifecycleService } from './order-lifecycle.service.js';

@Roles('BUYER', 'FARMER', 'TRANSPORTER', 'ADMIN')
@Controller('orders')
export class OrderLifecycleController {
  constructor(private readonly lifecycle: OrderLifecycleService) {}

  @Post(':id/actions/:action')
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action', new ParseEnumPipe(OrderAction)) action: OrderAction,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: TransitionOrderDto,
  ) {
    return this.lifecycle.transition(id, action, user, input.note);
  }
}
