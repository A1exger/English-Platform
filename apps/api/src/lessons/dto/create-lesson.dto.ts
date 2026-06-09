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

  // Optional: studentProfileIds to enroll immediately (e.g. an individual lesson)
  @IsOptional()
  @IsString({ each: true })
  studentProfileIds?: string[];
}
