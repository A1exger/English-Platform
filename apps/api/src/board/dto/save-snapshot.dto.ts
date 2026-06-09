import { IsOptional, IsString, Length } from 'class-validator';

export class SaveSnapshotDto {
  // Serialized board document (Yjs/tldraw state). Stored as a string blob.
  @IsString()
  snapshot!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;
}
