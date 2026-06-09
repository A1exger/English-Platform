import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BoardService } from './board.service';
import { SaveSnapshotDto } from './dto/save-snapshot.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('lessons/:lessonId/board')
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
  ) {
    return this.board.getForLesson(user, lessonId);
  }

  @Post('snapshot')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: SaveSnapshotDto,
  ) {
    return this.board.saveSnapshot(user, lessonId, dto);
  }

  @Get('history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
  ) {
    return this.board.history(user, lessonId);
  }
}
