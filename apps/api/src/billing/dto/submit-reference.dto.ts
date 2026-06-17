import { IsString, Length } from 'class-validator';

export class SubmitReferenceDto {
  // The money-transfer tracking number (Western Union MTCN / MoneyGram ref).
  @IsString()
  @Length(6, 40)
  reference!: string;
}
