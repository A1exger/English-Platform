import { IsString, Length } from 'class-validator';

export class LinkTelegramDto {
  @IsString()
  @Length(1, 64)
  chatId!: string;
}
