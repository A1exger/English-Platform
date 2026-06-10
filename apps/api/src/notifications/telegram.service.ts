import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface DeliveryResult {
  delivered: 'sent' | 'skipped';
  reason?: string;
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

  async chatIdFor(userId: string): Promise<string | null> {
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    return link?.chatId ?? null;
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
