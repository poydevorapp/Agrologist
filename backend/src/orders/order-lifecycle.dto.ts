import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TransitionOrderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note?: string;
}
