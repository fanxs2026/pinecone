import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  slug!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
