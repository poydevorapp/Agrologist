import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AppRole, AuthenticatedRequest, AuthenticatedUser, OwnedResource } from './authorization.types.js';

export const IS_PUBLIC_KEY = 'authorization:is-public';
export const ROLES_KEY = 'authorization:roles';
export const OWNER_KEY = 'authorization:owner';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
export const ResourceOwner = (resource: OwnedResource, parameter: string) =>
  SetMetadata(OWNER_KEY, { resource, parameter });

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
