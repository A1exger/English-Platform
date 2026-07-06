import { Module } from '@nestjs/common';
import { HomeworkService } from './homework.service';
import { HomeworkController } from './homework.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [HomeworkService],
  controllers: [HomeworkController],
  exports: [HomeworkService],
})
export class HomeworkModule {}
