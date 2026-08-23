import { Module } from '@nestjs/common';
import { RegistrationAdminController } from './registration-admin.controller';
import { RegistrationAdminService } from './registration-admin.service';

@Module({
  controllers: [RegistrationAdminController],
  providers: [RegistrationAdminService],
})
export class RegistrationAdminModule {}
