import { IsNumber, IsUUID, Max, Min } from 'class-validator';

export class DemoWalletActionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(900000000)
  amount!: number;

  @IsUUID()
  operationId!: string;
}
