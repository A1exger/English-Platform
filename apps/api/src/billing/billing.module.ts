import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeProvider } from './providers/stripe.provider';
import { PaypalProvider } from './providers/paypal.provider';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { PAYMENT_PROVIDERS_TOKEN } from './providers/payment-provider.interface';

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    StripeProvider,
    PaypalProvider,
    PaymentProviderRegistry,
    {
      provide: PAYMENT_PROVIDERS_TOKEN,
      // Order does not matter; the registry indexes by provider.name.
      useFactory: (config: ConfigService) => [
        new StripeProvider(config),
        new PaypalProvider(config),
      ],
      inject: [ConfigService],
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
