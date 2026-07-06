import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ASPECTS,
  Aspect,
  CONTENT_LEVELS,
  ContentLevel,
  GRADING_MODES,
  GradingMode,
  PAGE_TYPES,
  PageType,
  TASK_TYPES,
  TaskType,
} from '../../common/constants/enums';

export class CreateCategoryDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateCourseDto {
  @IsString()
  categoryId!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsBoolean()
  selfStudy?: boolean;

  @IsOptional()
  @IsBoolean()
  isNew?: boolean;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  selfStudy?: boolean;

  @IsOptional()
  @IsBoolean()
  isNew?: boolean;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

export class CreateSectionDto {
  @IsString()
  courseId!: string;

  @IsIn(CONTENT_LEVELS as unknown as string[])
  level!: ContentLevel;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateUnitDto {
  @IsString()
  sectionId!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateCourseLessonDto {
  @IsString()
  unitId!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsBoolean()
  optional?: boolean;

  /**
   * Desired level-wide position (1-based). Omitted -> appended at the end.
   * Inserting shifts every later lesson's order across ALL units (INV-1).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsString({ each: true })
  objectives?: string[];
}

export class UpdateCourseLessonDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  optional?: boolean;

  @IsOptional()
  @IsString({ each: true })
  objectives?: string[];
}

export class ReorderLessonDto {
  @IsInt()
  @Min(1)
  order!: number;
}

export class CheckTaskDto {
  @IsObject()
  state!: Record<string, unknown>;
}

export class AddDictionaryDto {
  @IsString()
  @Length(1, 120)
  word!: string;

  @IsOptional()
  @IsString()
  translation?: string;

  @IsOptional()
  @IsString()
  sourceLessonId?: string;
}

export class WordlistEntryDto {
  @IsString()
  @Length(1, 120)
  word!: string;

  @IsOptional()
  @IsString()
  translation?: string;

  @IsOptional()
  @IsString()
  example?: string;
}

export class SetWordlistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WordlistEntryDto)
  entries!: WordlistEntryDto[];
}

export class SetGrammarDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  meaning!: string;

  @IsString()
  form!: string;
}

export class CreatePageDto {
  @IsString()
  courseLessonId!: string;

  @IsIn(PAGE_TYPES as unknown as string[])
  type!: PageType;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  includedInHomework?: boolean;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

export class CreateTaskDto {
  @IsString()
  pageId!: string;

  @IsIn(TASK_TYPES as unknown as string[])
  type!: TaskType;

  @IsIn(GRADING_MODES as unknown as string[])
  gradingMode!: GradingMode;

  @IsIn(ASPECTS as unknown as string[])
  aspect!: Aspect;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  answerKey?: Record<string, unknown>;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsIn(GRADING_MODES as unknown as string[])
  gradingMode?: GradingMode;

  @IsOptional()
  @IsIn(ASPECTS as unknown as string[])
  aspect?: Aspect;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  answerKey?: Record<string, unknown>;
}
