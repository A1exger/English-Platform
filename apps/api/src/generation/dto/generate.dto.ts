import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { CONTENT_LEVELS } from '../../common/constants/enums';

// The generation brief (SPEC Прил. Г). Loose shaping is finished by parseBrief.
export class GenerateDto {
  @IsOptional()
  @IsIn(['COURSE', 'LESSON'])
  targetType?: string;

  @IsString()
  @Length(1, 300)
  topic!: string;

  @IsIn(CONTENT_LEVELS as unknown as string[])
  level!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  units?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  lessonsPerUnit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aspects?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;

  @IsOptional()
  @IsString()
  courseId?: string;
}
