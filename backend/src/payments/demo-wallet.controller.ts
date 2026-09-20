import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';
import { DemoWalletActionDto } from './demo-wallet.dto.js';
import { DemoWalletService } from './demo-wallet.service.js';

@Controller()
export class DemoWalletController {
  constructor(private readonly wallets: DemoWalletService) {}

  @Get('wallet')
  mine(@CurrentUser() user: AuthenticatedUser) { return this.wallets.mine(user.id); }

  @Post('wallet/demo-top-up')
  @HttpCode(200)
  topUp(@CurrentUser() user: AuthenticatedUser, @Body() input: DemoWalletActionDto) {
    return this.wallets.topUp(user.id, input.amount, input.operationId);
  }

  @Post('wallet/demo-cash-out')
  @HttpCode(200)
  cashOut(@CurrentUser() user: AuthenticatedUser, @Body() input: DemoWalletActionDto) {
    return this.wallets.cashOut(user.id, input.amount, input.operationId);
  }

  @Get('admin/platform-wallet')
  @Roles('ADMIN')
  platform() { return this.wallets.platform(); }
}
