import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { SaveStateDto } from './dto/exercise.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';

// Solving + checking a handed-out exercise (lesson or homework).
@UseGuards(JwtAuthGuard)
@Controller('exercise-instances')
export class ExerciseInstancesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exercises.getInstance(user, id);
  }

  @Patch(':id/state')
  saveState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveStateDto,
  ) {
    return this.exercises.saveState(user, id, dto.state);
  }

  @Post(':id/check')
  check(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exercises.check(user, id);
  }
}
