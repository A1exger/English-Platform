import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [ConfigModule],
  providers: [NotificationsService, TelegramService],
  controllers: [NotificationsController],
  exports: [NotificationsService, TelegramService],
})
export class NotificationsModule {}
