import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import {
  AdminDisputesQueryDto,
  AdminListingsQueryDto,
  AdminOrdersQueryDto,
  AdminShipmentsQueryDto,
  AdminUsersQueryDto,
  RejectListingDto,
} from './admin.dto.js';
import { AdminService } from './admin.service.js';

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('turnover')
  turnover() {
    return this.admin.turnover();
  }

  @Get('turnover-analytics')
  turnoverAnalytics() {
    return this.admin.turnoverAnalytics();
  }

  @Get('users')
  users(@Query() query: AdminUsersQueryDto) {
    return this.admin.users(query);
  }

  @Post('users/:id/ban')
  banUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admin.banUser(id, actor.id);
  }

  @Get('listings')
  listings(@Query() query: AdminListingsQueryDto) {
    return this.admin.listings(query);
  }

  @Get('orders')
  orders(@Query() query: AdminOrdersQueryDto) {
    return this.admin.orders(query);
  }

  @Get('shipments')
  shipments(@Query() query: AdminShipmentsQueryDto) {
    return this.admin.shipments(query);
  }

  @Get('disputes')
  disputes(@Query() query: AdminDisputesQueryDto) {
    return this.admin.disputes(query);
  }

  @Post('listings/:id/approve')
  approveListing(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.approveListing(id, user.id);
  }

  @Post('listings/:id/reject')
  rejectListing(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RejectListingDto,
  ) {
    return this.admin.rejectListing(id, user.id, input.reason);
  }
}
