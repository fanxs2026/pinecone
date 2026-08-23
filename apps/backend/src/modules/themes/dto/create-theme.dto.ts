import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateThemeDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  color?: string;
}
