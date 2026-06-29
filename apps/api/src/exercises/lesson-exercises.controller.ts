import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { CreateLessonExerciseDto } from './dto/exercise.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

// Live exercises pinned to a lesson board.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lessons/:lessonId/board/exercises')
export class LessonExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  // Anyone in the lesson can list active exercises (e.g. a student joining late).
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
  ) {
    return this.exercises.listLessonInstances(user, lessonId);
  }

  @Roles('tutor', 'admin')
  @Post()
  push(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateLessonExerciseDto,
  ) {
    return this.exercises.createLessonInstance(user, lessonId, dto.exerciseId);
  }
}
