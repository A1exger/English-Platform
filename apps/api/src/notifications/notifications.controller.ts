import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { LinkTelegramDto } from './dto/link-telegram.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  // Link the current user's Telegram chat by raw chat id. Kept for scripts and
  // tests; users go through the deep link below instead.
  @Post('telegram/link')
  linkTelegram(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkTelegramDto,
  ) {
    return this.telegram.link(user.id, dto.chatId);
  }

  /** The user's personal "connect Telegram" link + whether they're connected. */
  @Get('telegram')
  telegramStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.connectInfo(user.id);
  }

  @Delete('telegram')
  unlinkTelegram(@CurrentUser() user: AuthenticatedUser) {
    return this.telegram.unlink(user.id);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.list(user.id);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(user.id, id);
  }

  // Simulates the background dispatch worker (BullMQ in production).
  @Roles('admin')
  @Post('dispatch')
  dispatch() {
    return this.notifications.dispatchQueued();
  }
}

/**
 * Telegram's bot webhook. Unauthenticated by nature (Telegram calls it), so it
 * lives outside the guarded controller above; trust comes from the secret token
 * header configured with setWebhook. A user is only ever linked from a signed
 * /start payload that the app itself issued.
 */
@Controller('notifications/telegram')
export class TelegramWebhookController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('webhook')
  webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Record<string, unknown>,
  ) {
    if (!this.telegram.verifyWebhookSecret(secret)) {
      throw new ForbiddenException('Bad webhook secret');
    }
    return this.telegram.handleUpdate(update);
  }
}
