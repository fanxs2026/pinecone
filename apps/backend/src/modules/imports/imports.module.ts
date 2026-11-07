import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ActivitiesModule } from '../activities/activities.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

@Module({
  imports: [ActivitiesModule, CustomFieldsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
