import { BadRequestException, CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OWNER_KEY } from './authorization.decorators.js';
import { AuthenticatedRequest, OwnedResource } from './authorization.types.js';
import { OwnershipService } from './ownership.service.js';

type OwnerRequirement = { resource: OwnedResource; parameter: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly ownership: OwnershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<OwnerRequirement>(OWNER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const resourceId = request.params[requirement.parameter];
    const user = request.user;
    if (!resourceId || !UUID.test(resourceId)) throw new BadRequestException('Invalid resource ID');
    if (!user || !await this.ownership.owns(requirement.resource, resourceId, user.id)) {
      // The same response is used for missing and foreign resources to reduce ID enumeration.
      throw new NotFoundException('Resource not found');
    }
    return true;
  }
}
