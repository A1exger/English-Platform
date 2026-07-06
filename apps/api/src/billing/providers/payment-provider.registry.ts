import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CheckoutProvider } from '../../common/constants/enums';
import {
  PAYMENT_PROVIDERS_TOKEN,
  PaymentProvider,
} from './payment-provider.interface';

/** Resolves a {@link PaymentProvider} by name. */
@Injectable()
export class PaymentProviderRegistry {
  private readonly byName = new Map<string, PaymentProvider>();

  constructor(
    @Inject(PAYMENT_PROVIDERS_TOKEN) providers: PaymentProvider[],
  ) {
    for (const p of providers) {
      this.byName.set(p.name, p);
    }
  }

  get(name: CheckoutProvider): PaymentProvider {
    const provider = this.byName.get(name);
    if (!provider) {
      throw new BadRequestException(`Unsupported payment provider: ${name}`);
    }
    return provider;
  }
}
