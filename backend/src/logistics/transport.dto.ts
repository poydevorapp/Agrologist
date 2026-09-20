import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class AvailableTransportQueryDto {
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

export class CreateTransportOfferDto {
  @IsUUID()
  shipment_id!: string;

  @IsUUID()
  vehicle_id!: string;

}

export class CreateVehicleDto {
  @IsIn(['TRUCK', 'VAN', 'PICKUP', 'MOTORCYCLE', 'TRACTOR_TRAILER'])
  vehicle_type!: string;

  @IsString()
  @Matches(/^(?=(?:.*[A-Za-z0-9]){2})[A-Za-z0-9 -]{2,20}$/)
  plate_number!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999_999.99)
  capacity_kg!: number;

  @IsOptional()
  @IsBoolean()
  refrigerated?: boolean;
}
