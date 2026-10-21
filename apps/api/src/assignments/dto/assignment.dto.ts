import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
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
  /**
   * 0–10, same scale the auto-scored cards use, because both now feed the same
   * average. Bounded here on purpose: @IsOptional() on its own runs no other
   * check at all, so this field used to take "abc" (a 500 from the database
   * layer) and -5 (stored, and quietly dragging the average below zero).
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  score?: number;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  feedback?: string;
}
