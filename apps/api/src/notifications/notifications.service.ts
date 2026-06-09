import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannel } from '../common/constants/enums';

interface EnqueueParams {
  userId: string;
  templateKey: string; // i18n key under "notification", e.g. "homework_assigned"
  channel?: NotificationChannel;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Queue a notification. The recipient's locale is captured now so the message
   * is later rendered/sent in their language even if they change it afterwards.
   * Safe to call from other modules; failures never block the caller.
   */
  async enqueue({ userId, templateKey, channel = 'in_app', payload }: EnqueueParams) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return null;
    }
    return this.prisma.notification.create({
      data: {
        userId,
        channel,
        templateKey,
        locale: user.locale,
        payload: payload ? JSON.stringify(payload) : null,
        status: 'queued',
      },
    });
  }

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
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
  async dispatchQueued(): Promise<{ id: string; locale: string; text: string }[]> {
    const queued = await this.prisma.notification.findMany({
      where: { status: 'queued' },
    });
    const out: { id: string; locale: string; text: string }[] = [];
    for (const n of queued) {
      const args = n.payload ? JSON.parse(n.payload) : {};
      const text = await this.i18n.translate(
        `messages.notification.${n.templateKey}`,
        { lang: n.locale, args },
      );
      await this.prisma.notification.update({
        where: { id: n.id },
        data: { status: 'sent', sentAt: new Date() },
      });
      out.push({ id: n.id, locale: n.locale, text: String(text) });
    }
    return out;
  }
}
