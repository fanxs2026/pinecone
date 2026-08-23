import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TodoItemsService } from './todo-items.service';
import { CreateTodoItemDto, UpdateTodoItemDto, CompleteTodoItemDto } from './dto/todo-item.dto';

interface AuthedRequest extends Request {
  user?: { id: string; email: string; name?: string; [k: string]: any };
}

@ApiTags('Todo Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:wsId/ideas/:ideaId/todos')
export class TodoItemsController {
  constructor(private todoItemsService: TodoItemsService) {}

  @Get()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('VIEWER')
  @ApiOperation({ summary: 'List todo items of an idea' })
  findAll(@Param('wsId') wsId: string, @Param('ideaId') ideaId: string) {
    return this.todoItemsService.findAll(wsId, ideaId);
  }

  @Post()
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Create a todo item (notifies assignee by email)' })
  create(
    @Param('wsId') wsId: string,
    @Param('ideaId') ideaId: string,
    @Body() dto: CreateTodoItemDto,
    @Req() req: AuthedRequest,
  ) {
    return this.todoItemsService.create(wsId, ideaId, dto, req.user!.id);
  }

  @Patch(':todoId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Update todo item (creator or assignee only)' })
  update(
    @Param('wsId') wsId: string,
    @Param('ideaId') ideaId: string,
    @Param('todoId') todoId: string,
    @Body() dto: UpdateTodoItemDto,
    @Req() req: AuthedRequest,
  ) {
    return this.todoItemsService.update(wsId, ideaId, todoId, dto, req.user!.id);
  }

  @Patch(':todoId/complete')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Complete / un-complete (creator or assignee only, records completedAt)' })
  complete(
    @Param('wsId') wsId: string,
    @Param('ideaId') ideaId: string,
    @Param('todoId') todoId: string,
    @Body() dto: CompleteTodoItemDto,
    @Req() req: AuthedRequest,
  ) {
    return this.todoItemsService.setCompleted(wsId, ideaId, todoId, dto.completed, req.user!.id);
  }

  @Delete(':todoId')
  @UseGuards(WorkspaceRoleGuard)
  @Roles('MEMBER')
  @ApiOperation({ summary: 'Delete todo item (creator only)' })
  remove(
    @Param('wsId') wsId: string,
    @Param('ideaId') ideaId: string,
    @Param('todoId') todoId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.todoItemsService.remove(wsId, ideaId, todoId, req.user!.id);
  }
}
