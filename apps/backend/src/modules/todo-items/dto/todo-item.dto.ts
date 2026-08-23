import { IsString, IsOptional, IsUUID, IsDateString, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTodoItemDto {
  @ApiProperty({ description: '任务标题' })
  @IsString()
  @MaxLength(200, { message: 'Title must be at most 200 characters' })
  title!: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must be at most 2000 characters' })
  description?: string;

  @ApiProperty({ description: '负责人用户 ID' })
  @IsUUID()
  assigneeId!: string;

  @ApiPropertyOptional({ description: '要求完成日期 (ISO)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateTodoItemDto {
  @ApiPropertyOptional({ description: '任务标题' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Title must be at most 200 characters' })
  title?: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must be at most 2000 characters' })
  description?: string;

  @ApiPropertyOptional({ description: '负责人用户 ID' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: '要求完成日期 (ISO)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CompleteTodoItemDto {
  @ApiProperty({ description: '是否完成' })
  @IsBoolean()
  completed!: boolean;
}
