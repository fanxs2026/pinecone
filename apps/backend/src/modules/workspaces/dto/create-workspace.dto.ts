import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  // slug 会同时用作实体编码前缀（{SLUG}-{P}-{SEQ}，见 common/code-generator.ts）
  // 和知识库空间的派生 slug（后端只接受 [a-z0-9-]）。
  // 因此必须拒绝空格等分隔符：曾出现 slug="CEDA Client" 导致实体编码 "CEDA CLIENT-I-1"
  // 且知识库空间自动创建 400 的事故。
  @ApiProperty({ example: 'my-project' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9\u4e00-\u9fff]+(-[A-Za-z0-9\u4e00-\u9fff]+)*$/, {
    message: 'slug must contain only letters, digits, CJK characters and single hyphens (no spaces)',
  })
  slug!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
