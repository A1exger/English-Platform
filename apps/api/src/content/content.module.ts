import { Module } from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { AiClient } from '../generation/ai-client';

@Module({
  providers: [ContentService, AiClient],
  controllers: [ContentController],
  exports: [ContentService],
})
export class ContentModule {}
