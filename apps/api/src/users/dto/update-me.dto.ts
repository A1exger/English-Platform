import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CEFR_LEVELS, CefrLevel } from '../../common/constants/enums';

export class UpdateMeDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  // Tutor profile fields (applied only when the user is a tutor)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  headline?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  // Student profile fields (applied only when the user is a student)
  @IsOptional()
  @IsIn(CEFR_LEVELS as unknown as string[])
  cefrLevel?: CefrLevel;

  @IsOptional()
  @IsString()
  goals?: string;

  @IsOptional()
  @IsString()
  nativeLanguage?: string;
}
