import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreatePackageDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsInt()
  @Min(1)
  lessonsCount!: number;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;
}
