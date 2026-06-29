import { Module } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { ExercisesController } from './exercises.controller';
import { LessonExercisesController } from './lesson-exercises.controller';
import { ExerciseInstancesController } from './exercise-instances.controller';
import { LessonsModule } from '../lessons/lessons.module';

@Module({
  imports: [LessonsModule],
  providers: [ExercisesService],
  controllers: [
    ExercisesController,
    LessonExercisesController,
    ExerciseInstancesController,
  ],
  exports: [ExercisesService],
})
export class ExercisesModule {}
