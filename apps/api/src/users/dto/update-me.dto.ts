import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  ValidateIf,
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

  /**
   * An IANA zone ("Europe/Moscow"), or '' for "follow my browser".
   *
   * Used to be any string. A zone the browser's Intl does not know — "MSK",
   * "GMT+3" — makes every date formatter in the app throw, and next-intl
   * answers a throw by printing the raw Date ("Sat Aug 15 2026 21:41:57
   * GMT+0300 (Moscow Standard Time)") in place of every date on every screen.
   */
  @IsOptional()
  @IsString()
  @ValidateIf((o: UpdateMeDto) => o.timezone !== '')
  @IsTimeZone()
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
