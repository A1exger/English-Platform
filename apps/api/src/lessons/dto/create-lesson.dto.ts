import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { LESSON_TYPES, LessonType } from '../../common/constants/enums';

export class CreateLessonDto {
  @IsOptional()
  @IsIn(LESSON_TYPES as unknown as string[])
  type?: LessonType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  meetingUrl?: string;

  // Optional: the course lesson (content) to teach in this slot, so the room
  // opens ready. A loose id, like boardId.
  @IsOptional()
  @IsString()
  materialLessonId?: string;

  // Optional: studentProfileIds to enroll immediately (e.g. an individual lesson)
  @IsOptional()
  @IsString({ each: true })
  studentProfileIds?: string[];
}
