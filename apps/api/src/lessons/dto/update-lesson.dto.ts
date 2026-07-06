import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { LESSON_STATUSES, LessonStatus } from '../../common/constants/enums';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsIn(LESSON_STATUSES as unknown as string[])
  status?: LessonStatus;

  @IsOptional()
  @IsString()
  meetingUrl?: string;
}
