import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './auth.dto.js';
import { Public } from '../authorization/authorization.decorators.js';
import { CurrentUser } from '../authorization/authorization.decorators.js';
import { AuthenticatedUser } from '../authorization/authorization.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() input: LoginDto) {
    return this.auth.login(input);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  refresh(@Body() input: RefreshDto) {
    return this.auth.refresh(input.refreshToken);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() input: LogoutDto): Promise<void> {
    await this.auth.logout(input.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
