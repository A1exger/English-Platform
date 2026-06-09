import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CHECKOUT_PROVIDERS, CheckoutProvider } from '../../common/constants/enums';

export class CreateCheckoutDto {
  @IsIn(CHECKOUT_PROVIDERS as unknown as string[])
  provider!: CheckoutProvider;

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
