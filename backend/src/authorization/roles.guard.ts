import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './authorization.decorators.js';
import { AppRole, AuthenticatedRequest } from './authorization.types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
