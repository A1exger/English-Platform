import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { EXERCISE_TYPES } from '../exercise.logic';
import { TASK_TYPES } from '../../common/tasks/task-contract';
import { ASPECTS, GRADING_MODES } from '../../common/constants/enums';

// Legacy authoring types plus the canonical interactive types (SPEC §4). Both
// are accepted so the existing order/match/fill/categorize flows keep working
// while the canonical constructor is introduced.
const ALL_EXERCISE_TYPES = [...EXERCISE_TYPES, ...TASK_TYPES] as const;

export class CreateExerciseDto {
  @IsIn(ALL_EXERCISE_TYPES as unknown as string[])
  type!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  prompt?: string;

  @IsObject()
  payload!: Record<string, unknown>;

  // Author-supplied answer for canonical types that keep it separate (gap_fill,
  // categorization, multiple_choice). Validated + stored server-side only.
  @IsOptional()
  @IsObject()
  answerKey?: Record<string, unknown>;

  @IsOptional()
  @IsIn(GRADING_MODES as unknown as string[])
  gradingMode?: string;

  @IsOptional()
  @IsIn(ASPECTS as unknown as string[])
  aspect?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateExerciseDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  prompt?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  answerKey?: Record<string, unknown>;

  @IsOptional()
  @IsIn(GRADING_MODES as unknown as string[])
  gradingMode?: string;

  @IsOptional()
  @IsIn(ASPECTS as unknown as string[])
  aspect?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class SaveStateDto {
  @IsObject()
  state!: Record<string, unknown>;
}

export class CreateLessonExerciseDto {
  @IsString()
  exerciseId!: string;
}
