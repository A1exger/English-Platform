import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStudentDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
