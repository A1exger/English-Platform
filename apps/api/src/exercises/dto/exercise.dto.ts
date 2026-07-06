import { IsIn, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { EXERCISE_TYPES, ExerciseType } from '../exercise.logic';

export class CreateExerciseDto {
  @IsIn(EXERCISE_TYPES as unknown as string[])
  type!: ExerciseType;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class UpdateExerciseDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class SaveStateDto {
  @IsObject()
  state!: Record<string, unknown>;
}

export class CreateLessonExerciseDto {
  @IsString()
  exerciseId!: string;
}
