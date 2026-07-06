import { IsOptional, IsString, Length } from 'class-validator';

export class GradeHomeworkDto {
  @IsString()
  @Length(1, 40)
  grade!: string;

  @IsOptional()
  @IsString()
  feedback?: string;

  /** Grade a specific submission; defaults to the latest. */
  @IsOptional()
  @IsString()
  submissionId?: string;
}
