import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { AiClient } from './ai-client';
import { GenerationService } from './generation.service';
import { GenerationController } from './generation.controller';

@Module({
  imports: [ContentModule],
  providers: [GenerationService, AiClient],
  controllers: [GenerationController],
})
export class GenerationModule {}
