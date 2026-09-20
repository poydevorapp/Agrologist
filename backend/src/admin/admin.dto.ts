import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AdminPaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

export class AdminUsersQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'])
  status?: string;

  @IsOptional()
  @IsIn(['FARMER', 'BUYER', 'TRANSPORTER', 'ADMIN'])
  role?: string;
}

export class AdminListingsQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING', 'ACTIVE', 'RESERVED', 'SOLD', 'CANCELLED', 'REJECTED'])
  status?: string;

  @IsOptional()
  @IsUUID()
  product_id?: string;

  @IsOptional()
  @IsUUID()
  farmer_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  region?: string;
}

export class AdminOrdersQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'TRANSPORT_PENDING', 'TRANSPORT_ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED'])
  status?: string;

  @IsOptional()
  @IsUUID()
  buyer_id?: string;

  @IsOptional()
  @IsUUID()
  farmer_id?: string;
}

export class AdminShipmentsQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsIn(['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsUUID()
  order_id?: string;

  @IsOptional()
  @IsUUID()
  transporter_id?: string;
}

export class AdminDisputesQueryDto extends AdminPaginationDto {
  @IsOptional()
  @IsIn(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'])
  status?: string;

  @IsOptional()
  @IsUUID()
  order_id?: string;

  @IsOptional()
  @IsUUID()
  opened_by?: string;
}

export class RejectListingDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'reason must contain non-whitespace characters' })
  @MaxLength(1000)
  reason?: string;
}
