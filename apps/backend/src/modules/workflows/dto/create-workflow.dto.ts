import { IsString, IsEnum, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EntityType } from '../../../generated/enums';

export class CreateWorkflowDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: EntityType })
  @IsEnum(EntityType)
  entityType!: EntityType;
}
