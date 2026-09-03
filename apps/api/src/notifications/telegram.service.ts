import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface DeliveryResult {
  delivered: 'sent' | 'skipped';
  reason?: string;
}

/** Shape of the only Telegram update we care about: a /start in a private chat. */
interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
}

/**
 * Telegram delivery adapter. Sends notifications via the Bot API when
 * TELEGRAM_BOT_TOKEN is configured; otherwise it cleanly no-ops (skipped) so
 * the rest of the pipeline keeps working in dev/test. Users link their Telegram
 * chat via NotificationsController; in production a bot /start deep link would
 * capture the chatId automatically.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  link(userId: string, chatId: string) {
    return this.prisma.telegramLink.upsert({
      where: { userId },
      update: { chatId },
      create: { userId, chatId },
    });
  }

  async unlink(userId: string) {
    await this.prisma.telegramLink.deleteMany({ where: { userId } });
    return { linked: false };
  }

  async chatIdFor(userId: string): Promise<string | null> {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    return link?.chatId ?? null;
  }

  // --- self-service linking (deep link + webhook) ---------------------------
  //
  // Telegram will not let a bot message someone who has never opened a chat
  // with it, so every user has to press Start once — there is no way around
  // that. What we CAN do is make it one tap: the app hands out a personal
  // t.me/<bot>?start=<code> link, and the bot's webhook turns that Start into a
  // chat link automatically. Nothing is configured per student by hand.

  /** Sign the user id into a Start payload (letters/digits/_ only, ≤64 chars). */
  private signPayload(userId: string): string {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-secret';
    const mac = createHmac('sha256', secret).update(userId).digest('hex').slice(0, 16);
    return `${userId}_${mac}`;
  }

  /** Recover the user id from a Start payload, or null when it is not ours. */
  private verifyPayload(payload: string): string | null {
    const at = payload.lastIndexOf('_');
    if (at <= 0) return null;
    const userId = payload.slice(0, at);
    const given = payload.slice(at + 1);
    const expected = this.signPayload(userId).slice(userId.length + 1);
    if (given.length !== expected.length) return null;
    return timingSafeEqual(Buffer.from(given), Buffer.from(expected)) ? userId : null;
  }

  /**
   * The user's personal connect link, plus whether they are already connected.
   * `url` is null when TELEGRAM_BOT_USERNAME is not configured — the UI then
   * hides the option instead of offering a dead link.
   */
  async connectInfo(userId: string): Promise<{ connected: boolean; url: string | null }> {
    const bot = this.config.get<string>('TELEGRAM_BOT_USERNAME')?.replace(/^@/, '');
    return {
      connected: (await this.chatIdFor(userId)) !== null,
      url: bot ? `https://t.me/${bot}?start=${this.signPayload(userId)}` : null,
    };
  }

  /**
   * The header Telegram sends back, set when the webhook was registered with
   * `secret_token`. Fail closed: this endpoint is public, and an unset secret
   * would leave it open to anyone rather than merely unverified. Registering the
   * webhook without a secret means it stops working, which is the noisy failure
   * — not the quiet one.
   */
  verifyWebhookSecret(header: string | undefined): boolean {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? '';
    if (!expected || !header || header.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  }

  /**
   * Handle a bot update. Only "/start <payload>" is meaningful: it links the
   * chat to the account that generated the payload and confirms in-chat.
   */
  async handleUpdate(update: TelegramUpdate): Promise<{ linked: boolean }> {
    const text = update.message?.text ?? '';
    const chatId = update.message?.chat?.id;
    if (chatId === undefined || !text.startsWith('/start')) return { linked: false };

    const payload = text.slice('/start'.length).trim();
    const userId = payload ? this.verifyPayload(payload) : null;
    if (!userId) return { linked: false };

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { linked: false };

    await this.link(userId, String(chatId));
    await this.sendMessage(String(chatId), 'English Spark Studio: notifications are on.');
    return { linked: true };
  }

  async sendMessage(chatId: string, text: string): Promise<DeliveryResult> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      return { delivered: 'skipped', reason: 'no_token' };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) {
        return { delivered: 'skipped', reason: `http_${res.status}` };
      }
      return { delivered: 'sent' };
    } catch (e) {
      this.logger.warn(`Telegram send failed: ${String(e)}`);
      return { delivered: 'skipped', reason: 'error' };
    }
  }
}
