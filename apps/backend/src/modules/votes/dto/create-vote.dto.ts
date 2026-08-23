import { IsIn, IsString } from 'class-validator';

export class CreateVoteDto {
  @IsIn(['IDEA', 'SUPPORT', 'FEATURE'])
  entityType!: 'IDEA' | 'SUPPORT' | 'FEATURE';

  @IsString()
  entityId!: string;
}
