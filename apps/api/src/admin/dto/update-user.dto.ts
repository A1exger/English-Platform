import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_ROLES, UserRole } from '../../common/constants/enums';

/** Everything an admin may change on someone else's account. All optional. */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Set a new password directly. Omit to leave it alone. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[])
  role?: UserRole;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  /** Deactivating blocks sign-in without deleting any of their history. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
