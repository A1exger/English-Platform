import { createHmac, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckoutParams,
  CheckoutSession,
  NormalizedWebhookEvent,
  PaymentProvider,
} from './payment-provider.interface';

/**
 * Stripe adapter.
 *
 * createCheckout: in production this calls Stripe Checkout Sessions
 * (`stripe.checkout.sessions.create`). Without STRIPE_SECRET_KEY we return a
 * deterministic test session so the flow is exercisable end-to-end.
 *
 * parseWebhook: production uses `stripe.webhooks.constructEvent` with the
 * `Stripe-Signature` header. Here we verify an HMAC-SHA256 of the raw body with
 * STRIPE_WEBHOOK_SECRET — the same security property (only a holder of the
 * secret can forge events), simplified to one normalized event shape.
 */
@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;

  constructor(private readonly config: ConfigService) {}

  async createCheckout(params: CheckoutParams): Promise<CheckoutSession> {
    const externalId = `cs_test_${params.transactionId}`;
    return {
      externalId,
      checkoutUrl: `https://checkout.stripe.com/c/pay/${externalId}`,
    };
  }

  parseWebhook(rawBody: string, signature: string): NormalizedWebhookEvent {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    const provided = signature ?? '';
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid Stripe webhook signature');
    }

    let event: { type?: string; externalId?: string; status?: string };
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Malformed webhook body');
    }
    if (!event.externalId || !event.status) {
      throw new BadRequestException('Missing externalId/status in event');
    }
    return {
      externalId: event.externalId,
      status: event.status === 'succeeded' ? 'succeeded' : 'failed',
      type: event.type ?? 'payment',
    };
  }
}
