import { IsIn, IsString } from 'class-validator';

export class LinkEntityDto {
  @IsIn(['IDEA', 'SUPPORT', 'FEATURE'])
  entityType!: 'IDEA' | 'SUPPORT' | 'FEATURE';

  @IsString()
  entityId!: string;
}
