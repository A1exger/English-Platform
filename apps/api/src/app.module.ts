import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LessonsModule } from './lessons/lessons.module';
import { BillingModule } from './billing/billing.module';
import { HomeworkModule } from './homework/homework.module';
import { CrmModule } from './crm/crm.module';
import { VideoModule } from './video/video.module';
import { MaterialsModule } from './materials/materials.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: false,
      },
      // Resolve the request locale from ?lang=, custom header, or Accept-Language.
      resolvers: [
        new QueryResolver(['lang', 'locale']),
        new HeaderResolver(['x-lang']),
        AcceptLanguageResolver,
      ],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LessonsModule,
    BillingModule,
    HomeworkModule,
    CrmModule,
    VideoModule,
    MaterialsModule,
    NotificationsModule,
    AnalyticsModule,
    HealthModule,
  ],
})
export class AppModule {}
