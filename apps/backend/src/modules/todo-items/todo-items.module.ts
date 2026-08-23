import { Module } from '@nestjs/common';
import { TodoItemsController } from './todo-items.controller';
import { TodoItemsService } from './todo-items.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [TodoItemsController],
  providers: [TodoItemsService],
  exports: [TodoItemsService],
})
export class TodoItemsModule {}
