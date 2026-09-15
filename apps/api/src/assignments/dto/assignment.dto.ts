import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

// kind: "lesson" (assigned as a guided lesson) | "homework" (async ДЗ).
export class CreateAssignmentDto {
  @IsString()
  studentProfileId!: string;

  @IsIn(['lesson', 'homework'])
  kind!: 'lesson' | 'homework';

  /**
   * Source lesson to snapshot tasks from. When `taskIds` is omitted, every task
   * of the lesson is snapshotted (for kind=homework, only tasks on pages flagged
   * includedInHomework, falling back to all if none are flagged).
   */
  @IsOptional()
  @IsString()
  courseLessonId?: string;

  /** Explicit task selection ("pool" mode): snapshot exactly these tasks. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskIds?: string[];

  /** Topic tag shown on the homework card (ДЗ is tagged by topic). */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  topicTag?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class SubmitCardDto {
  @IsObject()
  state!: Record<string, unknown>;
}

// Manual grade/feedback for MANUAL (essay) cards.
export class GradeCardDto {
  @IsOptional()
  score?: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
