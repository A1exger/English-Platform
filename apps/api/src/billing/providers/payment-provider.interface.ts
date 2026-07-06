import { CheckoutProvider } from '../../common/constants/enums';

export interface CheckoutParams {
  /** Our internal transaction id, echoed back by the provider webhook. */
  transactionId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail?: string;
}

export interface CheckoutSession {
  /** Provider-side session/intent id, stored as Transaction.externalId. */
  externalId: string;
  checkoutUrl: string;
}

export interface NormalizedWebhookEvent {
  /** Matches a Transaction.externalId. */
  externalId: string;
  status: 'succeeded' | 'failed';
  type: string;
}

/**
 * Abstraction over payment gateways. The MVP ships Stripe and PayPal adapters;
 * additional/local providers (e.g. for Tunisia/CIS) can be added without
 * touching BillingService. Real SDK calls are stubbed where credentials are not
 * configured, but webhook signature verification is implemented for real.
 */
export interface PaymentProvider {
  readonly name: CheckoutProvider;
  createCheckout(params: CheckoutParams): Promise<CheckoutSession>;
  /**
   * Verify the signature over the raw request body and return a normalized
   * event. Throws if the signature is invalid.
   */
  parseWebhook(rawBody: string, signature: string): NormalizedWebhookEvent;
}

export const PAYMENT_PROVIDERS_TOKEN = 'PAYMENT_PROVIDERS_TOKEN';
