import {
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
} from 'class-validator';

export class AssignExercisesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  studentProfileIds!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  exerciseIds!: string[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}
