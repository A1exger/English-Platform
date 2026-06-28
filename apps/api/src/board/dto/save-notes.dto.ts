import { IsString, MaxLength } from 'class-validator';

export class SaveNotesDto {
  @IsString()
  @MaxLength(20000)
  notes!: string;
}
