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
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  coverUrl?: string;

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
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  coverUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

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

// Media attachments (SPEC §7). kind is restricted so only image/video/audio
// reach the content (ФТ-К305); the file itself is uploaded separately.
const MEDIA_KINDS = ['image', 'video', 'audio'] as const;

export class CreatePageMediaDto {
  @IsIn(MEDIA_KINDS as unknown as string[])
  kind!: string;

  @IsString()
  @Length(1, 500)
  url!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  caption?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  transcript?: string;
}

export class UpdatePageMediaDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  url?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  caption?: string;

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  transcript?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class ReorderMediaDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

// Drag-reorder: the client sends the full ordered id list (order = index).
export class ReorderCategoriesDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class ReorderCoursesDto {
  @IsString()
  categoryId!: string;

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

// Editor drag-reorder within a parent (order = index). Lessons keep their own
// level-wide endpoint (INV-1); these cover the remaining tree levels.
export class ReorderSectionsDto {
  @IsString()
  courseId!: string;

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class ReorderUnitsDto {
  @IsString()
  sectionId!: string;

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class ReorderPagesDto {
  @IsString()
  courseLessonId!: string;

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class ReorderTasksDto {
  @IsString()
  pageId!: string;

  @IsArray()
  @IsString({ each: true })
  ids!: string[];
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

export class ReviewDictionaryDto {
  // true = remembered (promote), false = missed (reset the streak).
  @IsBoolean()
  remembered!: boolean;
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

export class UpdatePageDto {
  @IsOptional()
  @IsIn(PAGE_TYPES as unknown as string[])
  type?: PageType;

  @IsOptional()
  @IsBoolean()
  includedInHomework?: boolean;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
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
