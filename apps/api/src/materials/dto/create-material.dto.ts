import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { MATERIAL_TYPES, MaterialType } from '../../common/constants/enums';

export class CreateMaterialDto {
  @IsIn(MATERIAL_TYPES as unknown as string[])
  type!: MaterialType;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  language?: string;
}
