import { IsString, IsOptional, IsUUID, MinLength, MaxLength, IsArray, IsIn, IsObject, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const TEST_CASE_TYPES = ['FEATURE', 'PERFORMANCE', 'SECURITY', 'API'] as const;
export type TestCaseType = (typeof TEST_CASE_TYPES)[number];

export const TEST_CASE_STATUSES = ['ACTIVE', 'DEPRECATED'] as const;
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

export const TEST_RUN_STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'UNTESTED'] as const;
export type TestRunStatus = (typeof TEST_RUN_STATUSES)[number];

export class CreateTestCaseDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, enum: TEST_CASE_TYPES })
  @IsString()
  @IsIn(TEST_CASE_TYPES)
  @IsOptional()
  type?: TestCaseType;

  @ApiProperty({ required: false, type: [Object] })
  @IsArray()
  @IsObject({ each: true })
  @IsOptional()
  steps?: Record<string, unknown>[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  expectedResult?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  storyId?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  releaseId?: string;
}
