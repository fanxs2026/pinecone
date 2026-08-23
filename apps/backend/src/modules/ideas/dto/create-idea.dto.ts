import { IsString, IsOptional, IsUUID, MinLength, MaxLength, IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IDEA_STATUSES, type IdeaStatus } from '../../../common/constants/entity-statuses';

export class CreateIdeaDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ required: false, enum: IDEA_STATUSES })
  @IsString()
  @IsOptional()
  @IsIn(IDEA_STATUSES)
  status?: IdeaStatus;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  assigneeId?: string;
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  assigneeName?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
