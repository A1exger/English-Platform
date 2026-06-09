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
 * PayPal adapter. Mirrors {@link StripeProvider}: production would create an
 * Order via the PayPal Orders API and verify webhooks with
 * `POST /v1/notifications/verify-webhook-signature`. Here checkout returns a
 * deterministic test order and webhooks are verified via HMAC over the raw body
 * with PAYPAL_WEBHOOK_SECRET.
 */
@Injectable()
export class PaypalProvider implements PaymentProvider {
  readonly name = 'paypal' as const;

  constructor(private readonly config: ConfigService) {}

  async createCheckout(params: CheckoutParams): Promise<CheckoutSession> {
    const externalId = `PAYID-${params.transactionId}`;
    return {
      externalId,
      checkoutUrl: `https://www.paypal.com/checkoutnow?token=${externalId}`,
    };
  }

  parseWebhook(rawBody: string, signature: string): NormalizedWebhookEvent {
    const secret = this.config.get<string>('PAYPAL_WEBHOOK_SECRET') ?? '';
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    const provided = signature ?? '';
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('Invalid PayPal webhook signature');
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
