import { IsEmail } from 'class-validator';

export class AddStudentDto {
  @IsEmail()
  email!: string;
}
