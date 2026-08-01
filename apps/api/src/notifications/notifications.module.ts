import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TelegramService } from './telegram.service';
import { MailService } from './mail.service';

@Module({
  imports: [ConfigModule],
  providers: [NotificationsService, TelegramService, MailService],
  controllers: [NotificationsController],
  exports: [NotificationsService, TelegramService, MailService],
})
export class NotificationsModule {}
