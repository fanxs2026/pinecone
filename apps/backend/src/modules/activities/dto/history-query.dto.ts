import { IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EntityType } from '../../../generated/enums';

export class HistoryQueryDto {
  @ApiProperty({ enum: EntityType })
  @IsEnum(EntityType)
  entityType!: EntityType;

  @ApiProperty()
  @IsUUID()
  entityId!: string;
}
