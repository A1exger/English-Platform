import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { DeliveryResult } from './telegram.service';

/**
 * Email delivery adapter. Sends over SMTP when SMTP_HOST is configured;
 * otherwise it cleanly no-ops (skipped) so dev/test and installs without a mail
 * server keep working — the same contract as TelegramService.
 *
 * Env: SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" for 465),
 *      SMTP_USER, SMTP_PASS, MAIL_FROM.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private get host(): string | undefined {
    return this.config.get<string>('SMTP_HOST');
  }

  /** Built once and reused; null when SMTP is not configured. */
  private transport(): Transporter | null {
    const host = this.host;
    if (!host) return null;
    if (!this.transporter) {
      const user = this.config.get<string>('SMTP_USER');
      const pass = this.config.get<string>('SMTP_PASS');
      this.transporter = createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        ...(user && pass ? { auth: { user, pass } } : {}),
      });
    }
    return this.transporter;
  }

  async sendMail(to: string, subject: string, text: string): Promise<DeliveryResult> {
    const transport = this.transport();
    if (!transport) {
      return { delivered: 'skipped', reason: 'no_smtp' };
    }
    try {
      // Default to the authenticated mailbox: most providers (Gmail among them)
      // reject or silently rewrite a From they do not own, so an invented
      // no-reply@ address would be worse than useless.
      const user = this.config.get<string>('SMTP_USER');
      const from =
        this.config.get<string>('MAIL_FROM') ||
        (user ? `English Spark Studio <${user}>` : `no-reply@${this.host as string}`);
      await transport.sendMail({ from, to, subject, text });
      return { delivered: 'sent' };
    } catch (e) {
      this.logger.warn(`Email send failed: ${String(e)}`);
      return { delivered: 'skipped', reason: 'error' };
    }
  }
}
