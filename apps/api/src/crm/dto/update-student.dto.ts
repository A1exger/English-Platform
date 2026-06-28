import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { CEFR_LEVELS, CefrLevel } from '../../common/constants/enums';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsIn(CEFR_LEVELS as unknown as string[])
  cefrLevel?: CefrLevel;

  @IsOptional()
  @IsString()
  goals?: string;

  @IsOptional()
  @IsString()
  nativeLanguage?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;
}
