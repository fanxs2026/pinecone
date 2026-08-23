import { IsString, IsUUID, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddTagDto {
  @ApiProperty()
  @IsUUID()
  tagId!: string;
}
