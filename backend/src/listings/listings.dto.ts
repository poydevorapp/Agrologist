import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const LISTING_UNITS = ['KG', 'TON', 'PIECE'] as const;
export type ListingUnit = (typeof LISTING_UNITS)[number];

export class CreateListingDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999_999.99)
  quantity!: number;

  @IsIn(LISTING_UNITS)
  unit!: ListingUnit;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  pricePerUnit!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  region!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  district!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class UpdateListingDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999_999.99)
  quantity?: number;

  @IsOptional()
  @IsIn(LISTING_UNITS)
  unit?: ListingUnit;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999.99)
  pricePerUnit?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}
