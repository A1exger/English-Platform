import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BoardModule } from '../board/board.module';
import { SessionGateway } from './session.gateway';

// Live-session envelope channel (/session namespace). Reuses BoardService for
// the lesson access check; the /board gateway itself is left untouched.
@Module({
  imports: [ConfigModule, JwtModule.register({}), BoardModule],
  providers: [SessionGateway],
})
export class SessionModule {}
