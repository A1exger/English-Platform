import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RetentionService } from './retention.service';

@Module({
  imports: [ConfigModule],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
