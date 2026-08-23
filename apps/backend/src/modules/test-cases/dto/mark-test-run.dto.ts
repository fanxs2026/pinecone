import { IsString, IsOptional, IsUUID, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TEST_RUN_STATUSES, TestRunStatus } from './create-test-case.dto';

export class MarkTestRunDto {
  @ApiProperty({ enum: TEST_RUN_STATUSES })
  @IsString()
  @IsIn(TEST_RUN_STATUSES)
  status!: TestRunStatus;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  releaseId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  actualResult?: string;
}
