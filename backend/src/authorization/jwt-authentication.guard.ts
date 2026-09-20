import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database/database.service.js';
import { TokenService } from '../auth/token.service.js';
import { IS_PUBLIC_KEY } from './authorization.decorators.js';
import { APP_ROLES, AppRole, AuthenticatedRequest } from './authorization.types.js';

type IdentityRow = {
  id: string;
  phone: string;
  email: string | null;
  full_name: string;
  roles: string[];
};

@Injectable()
export class JwtAuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) throw new UnauthorizedException('Authentication required');

    const payload = this.tokens.verifyAccess(match[1]!);
    const result = await this.database.query<IdentityRow>(
      `SELECT u.id, u.phone, u.email, u.full_name,
              COALESCE(array_agg(r.name ORDER BY r.name)
                FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1 AND u.status = 'ACTIVE'
       GROUP BY u.id, u.phone, u.email, u.full_name`,
      [payload.sub],
    );
    const row = result.rows[0];
    if (!row) throw new UnauthorizedException('Authentication required');
    const allowed = new Set<string>(APP_ROLES);
    request.user = {
      id: row.id,
      phone: row.phone,
      email: row.email,
      fullName: row.full_name,
      roles: row.roles.filter((role): role is AppRole => allowed.has(role)),
    };
    return true;
  }
}
