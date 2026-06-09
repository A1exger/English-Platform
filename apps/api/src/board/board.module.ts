import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BoardService } from './board.service';
import { BoardController } from './board.controller';
import { BoardGateway } from './board.gateway';
import { LessonsModule } from '../lessons/lessons.module';

@Module({
  imports: [ConfigModule, JwtModule.register({}), LessonsModule],
  providers: [BoardService, BoardGateway],
  controllers: [BoardController],
  exports: [BoardService],
})
export class BoardModule {}
