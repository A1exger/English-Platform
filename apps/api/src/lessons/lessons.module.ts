import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { BillingModule } from '../billing/billing.module';
import { VideoModule } from '../video/video.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [BillingModule, VideoModule, NotificationsModule],
  providers: [LessonsService],
  controllers: [LessonsController],
  exports: [LessonsService],
})
export class LessonsModule {}
