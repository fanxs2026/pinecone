import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateReleaseStatusDto {
  @ApiProperty({ enum: ['PLANNING', 'IN_PROGRESS', 'CLOSED'] })
  @IsString()
  @IsIn(['PLANNING', 'IN_PROGRESS', 'CLOSED'])
  status!: string;
}
