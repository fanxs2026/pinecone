import { IsEnum, IsUUID, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EntityType } from '../../../generated/enums';

export class CreateCommentDto {
  @ApiProperty({ enum: EntityType })
  @IsEnum(EntityType)
  entityType!: EntityType;

  @ApiProperty()
  @IsUUID()
  entityId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content!: string;
}
