import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { SmtpSettingsService } from './smtp-settings.service';
import { MailSettingsController } from './mail-settings.controller';

@Module({
  controllers: [MailSettingsController],
  providers: [MailService, SmtpSettingsService],
  exports: [MailService],
})
export class MailModule {}
