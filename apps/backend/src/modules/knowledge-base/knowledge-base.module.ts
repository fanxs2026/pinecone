import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KbCollabService } from './kb-collab.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, KbCollabService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
