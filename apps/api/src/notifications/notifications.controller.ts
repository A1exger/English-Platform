import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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

  // Link the current user's Telegram chat so they can receive notifications
  // there (in production captured via a bot /start deep link).
  @Post('telegram/link')
  linkTelegram(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkTelegramDto,
  ) {
    return this.telegram.link(user.id, dto.chatId);
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
