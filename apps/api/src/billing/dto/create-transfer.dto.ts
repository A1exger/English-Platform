import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { OFFLINE_PROVIDERS, OfflineProvider } from '../../common/constants/enums';

export class CreateTransferDto {
  @IsIn(OFFLINE_PROVIDERS as unknown as string[])
  method!: OfflineProvider;

  /** Buy a package... */
  @IsOptional()
  @IsString()
  packageId?: string;

  /** ...or top up the balance with an arbitrary amount. One of the two. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;
}
