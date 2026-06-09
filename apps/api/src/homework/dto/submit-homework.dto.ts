import { IsArray, IsOptional, IsString } from 'class-validator';

export class SubmitHomeworkDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileUrls?: string[];
}
