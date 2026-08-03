import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel } from '../common/constants/enums';
import { TelegramService } from './telegram.service';
import { MailService } from './mail.service';

interface EnqueueParams {
  userId: string;
  templateKey: string; // i18n key under "notification", e.g. "homework_assigned"
  /** Force a single channel. Omit to fan out to every channel the user has. */
  channel?: NotificationChannel;
  payload?: Record<string, unknown>;
}

/** How often the built-in dispatcher drains the queue (see startDispatcher). */
const DISPATCH_INTERVAL_MS = 30_000;

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly telegram: TelegramService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Drain the queue periodically so email/Telegram actually go out without an
   * external worker. Disabled under test (and by NOTIFY_DISPATCH=off) so suites
   * stay deterministic and drive dispatchQueued() themselves.
   */
  onModuleInit() {
    const off =
      this.config.get<string>('NOTIFY_DISPATCH') === 'off' ||
      process.env.NODE_ENV === 'test';
    if (off) return;
    this.timer = setInterval(() => {
      void this.dispatchQueued().catch((e) =>
        this.logger.warn(`Notification dispatch failed: ${String(e)}`),
      );
    }, DISPATCH_INTERVAL_MS);
    // Never hold the process open just for the dispatcher.
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Queue a notification. The recipient's locale is captured now so the message
   * is later rendered/sent in their language even if they change it afterwards.
   * Safe to call from other modules; failures never block the caller.
   *
   * With no explicit channel the event fans out to every route the user has:
   * always in-app, by email (they all have an address), and to Telegram when
   * they have linked a chat. Each row is delivered independently.
   */
  async enqueue({ userId, templateKey, channel, payload }: EnqueueParams) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return null;
    }
    const data = {
      userId,
      templateKey,
      locale: user.locale,
      payload: payload ? JSON.stringify(payload) : null,
      status: 'queued',
    };
    if (channel) {
      return this.prisma.notification.create({ data: { ...data, channel } });
    }

    const channels: NotificationChannel[] = ['in_app', 'email'];
    if (await this.telegram.chatIdFor(userId)) channels.push('telegram');
    const rows = await Promise.all(
      channels.map((c) => this.prisma.notification.create({ data: { ...data, channel: c } })),
    );
    // The in-app row is the one the bell reads, so return that one.
    return rows[0];
  }

  /**
   * The in-app inbox. Only in_app rows: an event fans out to email/Telegram as
   * separate rows, and the bell must show each event once, not once per route.
   */
  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId, channel: 'in_app' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(userId: string, id: string) {
    // Scope the update to the owner so users can't read others' notifications.
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { status: 'read' },
    });
    return { updated: result.count };
  }

  /**
   * Render a queued notification's text in its stored locale. Mirrors what the
   * email/Telegram worker (BullMQ) would send. Exposed for in-app display/tests.
   */
  async render(notificationId: string): Promise<string> {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!n) {
      return '';
    }
    const args = n.payload ? JSON.parse(n.payload) : {};
    return this.i18n.translate(`messages.notification.${n.templateKey}`, {
      lang: n.locale,
      args,
    });
  }

  /**
   * Simulate the background dispatch worker: render each queued notification in
   * its locale and mark it sent. Returns the rendered messages for inspection.
   */
  async dispatchQueued(): Promise<
    { id: string; channel: string; locale: string; text: string; delivered: string }[]
  > {
    const queued = await this.prisma.notification.findMany({
      where: { status: 'queued' },
    });
    const out: {
      id: string;
      channel: string;
      locale: string;
      text: string;
      delivered: string;
    }[] = [];
    for (const n of queued) {
      const args = n.payload ? JSON.parse(n.payload) : {};
      const text = String(
        await this.i18n.translate(`messages.notification.${n.templateKey}`, {
          lang: n.locale,
          args,
        }),
      );

      // Route by channel. in_app is just the stored row (the bell reads it);
      // telegram goes out over the Bot API when linked; email over SMTP. Both
      // adapters no-op cleanly when unconfigured, so an install without a mail
      // server or bot keeps working.
      let delivered = 'sent';
      if (n.channel === 'telegram') {
        const chatId = await this.telegram.chatIdFor(n.userId);
        const result = chatId
          ? await this.telegram.sendMessage(chatId, text)
          : { delivered: 'skipped' as const, reason: 'no_link' };
        delivered = result.delivered;
      } else if (n.channel === 'email') {
        const user = await this.prisma.user.findUnique({
          where: { id: n.userId },
          select: { email: true },
        });
        const subject = String(
          await this.i18n.translate('messages.notification.subject', { lang: n.locale }),
        );
        const result = user?.email
          ? await this.mail.sendMail(user.email, subject, text)
          : { delivered: 'skipped' as const, reason: 'no_address' };
        delivered = result.delivered;
      }

      await this.prisma.notification.update({
        where: { id: n.id },
        data: { status: 'sent', sentAt: new Date() },
      });
      out.push({ id: n.id, channel: n.channel, locale: n.locale, text, delivered });
    }
    return out;
  }
}
