import {
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateHomeworkDto {
  @IsString()
  studentProfileId!: string;

  @IsOptional()
  @IsString()
  lessonId?: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}
